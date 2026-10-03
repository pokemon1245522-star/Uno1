import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  PlayableColor,
  GameRules,
  PublicPlayer,
  PublicGameState,
  ClientSyncState,
  ChatMessage,
  DEFAULT_RULES,
} from '../../shared/types';
import { createUnoDeck, shuffleDeck, isCardPlayable, calculateHandScore } from '../../shared/unoEngine';
import { soundManager } from './audio';

const PUB_BASE = 'https://ntfy.sh';

export function useUnoMultiplayer() {
  const [syncState, setSyncState] = useState<ClientSyncState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);

  const [myPlayerId] = useState<string>(() => {
    let pid = localStorage.getItem('uno_player_id');
    if (!pid) {
      pid = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      localStorage.setItem('uno_player_id', pid);
    }
    return pid;
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const isHostRef = useRef<boolean>(false);
  const joinIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Host authoritative memory
  const hostGameStateRef = useRef<PublicGameState | null>(null);
  const hostHandsRef = useRef<Map<string, Card[]>>(new Map());
  const hostDeckRef = useRef<Card[]>([]);
  const hostDiscardRef = useRef<Card[]>([]);
  const hasDrawnThisTurnRef = useRef<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Publish an event over HTTPS
  const postEvent = useCallback(async (roomId: string, eventObj: any) => {
    try {
      await fetch(`${PUB_BASE}/unolive_v3_${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventObj),
      });
    } catch (e) {
      console.warn('Network post error:', e);
    }
  }, []);

  // Host broadcasts state to all players
  const hostBroadcastSync = useCallback(() => {
    const state = hostGameStateRef.current;
    if (!state) return;

    // Collect all hands to package for each player
    const handsObj: Record<string, Card[]> = {};
    for (const [pid, h] of hostHandsRef.current.entries()) {
      handsObj[pid] = h;
    }

    const payload = {
      type: 'SYNC_BROADCAST',
      gameState: state,
      hands: handsObj,
      timestamp: Date.now(),
    };

    // Update host's own syncState locally immediately
    const myHand = hostHandsRef.current.get(myPlayerId) || [];
    const isTurn = state.currentTurnPlayerId === myPlayerId && state.status === 'playing';
    const playableCardIds = isTurn
      ? myHand
          .filter((c) => isCardPlayable(c, state.topCard, state.currentColor, state.pendingDrawCount, state.settings))
          .map((c) => c.id)
      : [];

    const hostPlayer = state.players.find((p) => p.id === myPlayerId);
    const catchTarget = state.players.find(
      (p) => p.id !== myPlayerId && p.cardCount === 1 && p.mustCallUno && !p.calledUno
    );

    setSyncState({
      gameState: state,
      myHand,
      myPlayerId,
      canDraw: Boolean(
        isTurn &&
          !state.pendingColorChoice &&
          (state.pendingDrawCount > 0 || !hasDrawnThisTurnRef.current || state.settings.drawUntilPlayable)
      ),
      canPass: Boolean(
        isTurn &&
          !state.pendingColorChoice &&
          state.pendingDrawCount === 0 &&
          hasDrawnThisTurnRef.current
      ),
      canCallUno: Boolean(hostPlayer && hostPlayer.cardCount <= 2 && !hostPlayer.calledUno),
      canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
      playableCardIds,
    });

    // Broadcast to guests
    postEvent(state.roomId, payload);
  }, [myPlayerId, postEvent]);

  // Host turn timer
  useEffect(() => {
    if (!isHostRef.current) return;
    const interval = setInterval(() => {
      const state = hostGameStateRef.current;
      if (!state || state.status !== 'playing' || !state.turnExpiresAt) return;

      if (Date.now() >= state.turnExpiresAt) {
        handleTurnTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleTurnTimeout = () => {
    const state = hostGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const curPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
    if (!curPlayer) return;

    if (hostDeckRef.current.length > 0) {
      const drawn = hostDeckRef.current.pop()!;
      const curHand = hostHandsRef.current.get(curPlayer.id) || [];
      curHand.push(drawn);
      curPlayer.cardCount = curHand.length;
    }

    const active = state.players.filter((p) => !p.isSpectator);
    const curIdx = active.findIndex((p) => p.id === curPlayer.id);
    let nextIdx = curIdx + state.direction;
    while (nextIdx < 0) nextIdx += active.length;
    const nextPlayer = active[nextIdx % active.length];

    state.currentTurnPlayerId = nextPlayer.id;
    state.turnExpiresAt =
      state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'TIMEOUT',
      playerId: curPlayer.id,
      playerName: curPlayer.name,
      message: `${curPlayer.name}'s turn timed out and passed.`,
      timestamp: Date.now(),
    };

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  };

  // Setup EventSource listener
  const listenToRoom = useCallback(
    (roomId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const url = `${PUB_BASE}/unolive_v3_${roomId}/sse`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
        setErrorMessage(null);
      };

      es.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          if (!envelope.message) return;
          const msg = JSON.parse(envelope.message);

          // 1. Guest receives SYNC_BROADCAST from Host
          if (msg.type === 'SYNC_BROADCAST') {
            const guestHand = msg.hands[myPlayerId] || [];
            const state: PublicGameState = msg.gameState;

            // Stop join retry interval if running
            if (joinIntervalRef.current) {
              clearInterval(joinIntervalRef.current);
              joinIntervalRef.current = null;
            }

            const isTurn = state.currentTurnPlayerId === myPlayerId && state.status === 'playing';
            const playableCardIds = isTurn
              ? guestHand
                  .filter((c: Card) =>
                    isCardPlayable(c, state.topCard, state.currentColor, state.pendingDrawCount, state.settings)
                  )
                  .map((c: Card) => c.id)
              : [];

            const pObj = state.players.find((p) => p.id === myPlayerId);
            const catchTarget = state.players.find(
              (p) => p.id !== myPlayerId && p.cardCount === 1 && p.mustCallUno && !p.calledUno
            );

            // Audio cues
            if (state.lastAction) {
              if (state.lastAction.type === 'UNO_CALLED') soundManager.playUnoFanfare();
              else if (state.lastAction.type === 'CARD_PLAYED') soundManager.playCardSnap();
              else if (state.lastAction.type === 'DRAW_CARD') soundManager.playCardDraw();
              else if (state.lastAction.type === 'ROUND_WON') soundManager.playWin();
              showToast(state.lastAction.message);
            }

            if (state.currentTurnPlayerId === myPlayerId) {
              soundManager.playTurnDing();
            }

            setSyncState({
              gameState: state,
              myHand: guestHand,
              myPlayerId,
              canDraw: isTurn && !state.pendingColorChoice,
              canPass: isTurn && !state.pendingColorChoice && state.pendingDrawCount === 0,
              canCallUno: Boolean(pObj && pObj.cardCount <= 2 && !pObj.calledUno),
              canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
              playableCardIds,
            });
          }

          // 2. Chat messages
          if (msg.type === 'CHAT') {
            setChatMessages((prev) => [...prev.slice(-49), msg.payload]);
          }

          // 3. Host receives guest action
          if (isHostRef.current && msg.type === 'CLIENT_ACTION') {
            handleHostIncomingAction(msg.action);
          }
        } catch (err) {
          // ignore non-JSON or heartbeat
        }
      };

      es.onerror = () => {
        setIsConnected(false);
      };
    },
    [myPlayerId, showToast]
  );

  // Host processes actions
  const handleHostIncomingAction = (action: any) => {
    const state = hostGameStateRef.current;
    if (!state) return;

    switch (action.type) {
      case 'JOIN': {
        const { playerId, name, avatar } = action.payload;

        // Check if already in room
        const existing = state.players.find((p) => p.id === playerId);
        if (existing) {
          existing.isConnected = true;
          existing.name = name;
          existing.avatar = avatar;
          hostBroadcastSync();
          return;
        }

        if (state.players.length >= state.settings.maxPlayers && state.status === 'lobby') {
          return;
        }

        const newPlayer: PublicPlayer = {
          id: playerId,
          name: name.slice(0, 16) || 'Player',
          avatar: avatar || '🐱',
          cardCount: 0,
          score: 0,
          roundScore: 0,
          isConnected: true,
          isReady: false,
          isHost: false,
          isSpectator: state.status !== 'lobby',
          calledUno: false,
          mustCallUno: false,
        };

        state.players.push(newPlayer);
        hostHandsRef.current.set(playerId, []);

        state.lastAction = {
          id: `act_${Date.now()}`,
          type: 'PLAYER_JOINED',
          playerId,
          playerName: newPlayer.name,
          message: `${newPlayer.name} joined the room!`,
          timestamp: Date.now(),
        };

        hostBroadcastSync();
        postEvent(state.roomId, {
          type: 'CHAT',
          payload: {
            id: `msg_${Date.now()}`,
            senderId: 'system',
            senderName: 'System',
            text: `${newPlayer.name} joined the room!`,
            isSystem: true,
            timestamp: Date.now(),
          },
        });
        break;
      }

      case 'TOGGLE_READY': {
        const pid = action.payload.playerId;
        const p = state.players.find((player) => player.id === pid);
        if (p) {
          p.isReady = !p.isReady;
          hostBroadcastSync();
        }
        break;
      }

      case 'PLAY_CARD': {
        const { playerId, cardId, chosenColor } = action.payload;
        executeHostPlayCard(playerId, cardId, chosenColor);
        break;
      }

      case 'DRAW_CARD': {
        const { playerId } = action.payload;
        executeHostDrawCard(playerId);
        break;
      }

      case 'PASS_TURN': {
        const { playerId } = action.payload;
        executeHostPassTurn(playerId);
        break;
      }

      case 'CALL_UNO': {
        const { playerId } = action.payload;
        executeHostCallUno(playerId);
        break;
      }

      case 'CATCH_UNO': {
        const { callerId, targetPlayerId } = action.payload;
        executeHostCatchUno(callerId, targetPlayerId);
        break;
      }
    }
  };

  const executeHostPlayCard = (playerId: string, cardId: string, chosenColor?: PlayableColor) => {
    const state = hostGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const hand = hostHandsRef.current.get(playerId) || [];
    const cardIdx = hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return;
    const card = hand[cardIdx];

    hand.splice(cardIdx, 1);
    hostDiscardRef.current.push(card);
    state.topCard = card;

    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      player.cardCount = hand.length;
      player.mustCallUno = hand.length === 1 && !player.calledUno;
    }

    if (hand.length === 0) {
      let roundScore = 0;
      const revealed: Record<string, Card[]> = {};
      for (const p of state.players) {
        const h = hostHandsRef.current.get(p.id) || [];
        revealed[p.id] = h;
        if (p.id !== playerId) {
          roundScore += calculateHandScore(h);
        }
      }

      if (player) {
        player.score += roundScore;
        player.roundScore = roundScore;
      }

      const isGameOver = (player?.score || 0) >= state.settings.targetScore;
      state.status = isGameOver ? 'game_over' : 'round_ended';
      state.winnerId = isGameOver ? playerId : null;
      state.roundWinnerId = playerId;
      state.revealedHands = revealed;
      state.lastAction = {
        id: `act_${Date.now()}`,
        type: 'ROUND_WON',
        playerId,
        playerName: player?.name || 'Player',
        message: `🏆 ${player?.name || 'Player'} won the round! (+${roundScore} pts)`,
        timestamp: Date.now(),
      };
      hostBroadcastSync();
      return;
    }

    const newColor: PlayableColor = (chosenColor || (card.color === 'wild' ? 'red' : card.color)) as PlayableColor;
    state.currentColor = newColor;

    let skipSteps = 1;
    const active = state.players.filter((p) => !p.isSpectator);

    if (card.value === 'skip') {
      skipSteps = active.length === 2 ? 0 : 2;
    } else if (card.value === 'reverse') {
      if (active.length === 2) {
        skipSteps = 0;
      } else {
        state.direction = (state.direction * -1) as 1 | -1;
      }
    } else if (card.value === 'draw2') {
      state.pendingDrawCount = state.settings.stackingDraw ? state.pendingDrawCount + 2 : 2;
    } else if (card.value === 'wild_draw4') {
      state.pendingDrawCount = state.settings.stackingDraw ? state.pendingDrawCount + 4 : 4;
    }

    const curIdx = active.findIndex((p) => p.id === playerId);
    let nextIdx = curIdx + state.direction * skipSteps;
    while (nextIdx < 0) nextIdx += active.length;
    const nextPlayer = active[nextIdx % active.length];

    state.currentTurnPlayerId = nextPlayer.id;
    state.turnExpiresAt =
      state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.discardCount = hostDiscardRef.current.length;

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'CARD_PLAYED',
      playerId,
      playerName: player?.name || 'Player',
      message: `${player?.name || 'Player'} played ${card.color.toUpperCase()} ${card.value.toUpperCase()}${
        card.color === 'wild' ? ` (Color: ${newColor.toUpperCase()})` : ''
      }`,
      card,
      timestamp: Date.now(),
    };

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  };

  const executeHostDrawCard = (playerId: string) => {
    const state = hostGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    if (hostDeckRef.current.length === 0 && hostDiscardRef.current.length > 1) {
      const top = hostDiscardRef.current.pop()!;
      hostDeckRef.current = shuffleDeck(hostDiscardRef.current);
      hostDiscardRef.current = [top];
    }

    if (hostDeckRef.current.length === 0) return;

    const count = state.pendingDrawCount > 0 ? state.pendingDrawCount : 1;
    const hand = hostHandsRef.current.get(playerId) || [];
    const drawn = hostDeckRef.current.splice(0, Math.min(count, hostDeckRef.current.length));
    hand.push(...drawn);

    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      player.cardCount = hand.length;
      player.calledUno = false;
      player.mustCallUno = false;
    }

    state.deckCount = hostDeckRef.current.length;
    const isPenalty = state.pendingDrawCount > 0;
    state.pendingDrawCount = 0;

    if (isPenalty) {
      const active = state.players.filter((p) => !p.isSpectator);
      const curIdx = active.findIndex((p) => p.id === playerId);
      let nextIdx = curIdx + state.direction;
      while (nextIdx < 0) nextIdx += active.length;
      state.currentTurnPlayerId = active[nextIdx % active.length].id;
    }

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: isPenalty ? 'PENALTY_DRAW' : 'DRAW_CARD',
      playerId,
      playerName: player?.name || 'Player',
      message: `${player?.name || 'Player'} drew ${drawn.length} card(s).`,
      timestamp: Date.now(),
    };

    if (playerId === myPlayerId && !isPenalty) {
      hasDrawnThisTurnRef.current = true;
    }

    hostBroadcastSync();
  };

  const executeHostPassTurn = (playerId: string) => {
    const state = hostGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const active = state.players.filter((p) => !p.isSpectator);
    const curIdx = active.findIndex((p) => p.id === playerId);
    let nextIdx = curIdx + state.direction;
    while (nextIdx < 0) nextIdx += active.length;
    const nextPlayer = active[nextIdx % active.length];

    const player = state.players.find((p) => p.id === playerId);
    state.currentTurnPlayerId = nextPlayer.id;
    state.turnExpiresAt =
      state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'PASS',
      playerId,
      playerName: player?.name || 'Player',
      message: `${player?.name || 'Player'} passed their turn.`,
      timestamp: Date.now(),
    };

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  };

  const executeHostCallUno = (playerId: string) => {
    const state = hostGameStateRef.current;
    if (!state) return;
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.cardCount > 2) return;

    player.calledUno = true;
    player.mustCallUno = false;
    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'UNO_CALLED',
      playerId,
      playerName: player.name,
      message: `🔥 ${player.name} shouted UNO! 🔥`,
      timestamp: Date.now(),
    };
    hostBroadcastSync();
  };

  const executeHostCatchUno = (callerId: string, targetId: string) => {
    const state = hostGameStateRef.current;
    if (!state) return;

    const target = state.players.find((p) => p.id === targetId);
    const caller = state.players.find((p) => p.id === callerId);
    if (!target || !caller || target.cardCount !== 1 || !target.mustCallUno || target.calledUno) return;

    const penalty = state.settings.unoPenaltyCards || 2;
    const targetHand = hostHandsRef.current.get(targetId) || [];
    const drawn = hostDeckRef.current.splice(0, Math.min(penalty, hostDeckRef.current.length));
    targetHand.push(...drawn);

    target.cardCount = targetHand.length;
    target.mustCallUno = false;
    target.calledUno = false;
    state.deckCount = hostDeckRef.current.length;

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'CAUGHT_UNO',
      playerId: callerId,
      playerName: caller.name,
      message: `⚡ ${caller.name} caught ${target.name} forgetting UNO! +${penalty} penalty!`,
      timestamp: Date.now(),
    };
    hostBroadcastSync();
  };

  // CREATE ROOM: Generates room code and opens lobby immediately
  const createRoom = useCallback(
    (playerName: string, avatar: string, settings?: Partial<GameRules>) => {
      setErrorMessage(null);
      isHostRef.current = true;
      const roomId = generateRoomCode();
      currentRoomIdRef.current = roomId;

      const hostPlayer: PublicPlayer = {
        id: myPlayerId,
        name: playerName.trim().slice(0, 16) || 'Host',
        avatar: avatar || '🦊',
        cardCount: 0,
        score: 0,
        roundScore: 0,
        isConnected: true,
        isReady: true,
        isHost: true,
        isSpectator: false,
        calledUno: false,
        mustCallUno: false,
      };

      const initialRoom: PublicGameState = {
        roomId,
        hostId: myPlayerId,
        status: 'lobby',
        settings: { ...DEFAULT_RULES, ...settings },
        players: [hostPlayer],
        topCard: null,
        currentColor: null,
        currentTurnPlayerId: null,
        direction: 1,
        pendingDrawCount: 0,
        pendingColorChoice: false,
        pendingColorPlayerId: null,
        roundNumber: 1,
        winnerId: null,
        roundWinnerId: null,
        turnExpiresAt: null,
        deckCount: 0,
        discardCount: 0,
        lastAction: {
          id: `act_${Date.now()}`,
          type: 'ROOM_CREATED',
          playerId: myPlayerId,
          playerName: hostPlayer.name,
          message: `Room ${roomId} created! Share this code with friends.`,
          timestamp: Date.now(),
        },
      };

      hostGameStateRef.current = initialRoom;
      hostHandsRef.current.set(myPlayerId, []);

      // Instant transition
      setSyncState({
        gameState: initialRoom,
        myHand: [],
        myPlayerId,
        canDraw: false,
        canPass: false,
        canCallUno: false,
        canCatchUnoTargetId: null,
        playableCardIds: [],
      });

      listenToRoom(roomId);

      // Publish initial state
      postEvent(roomId, {
        type: 'SYNC_BROADCAST',
        gameState: initialRoom,
        hands: { [myPlayerId]: [] },
        timestamp: Date.now(),
      });

      showToast(`Room ${roomId} created! Share code with friends.`);
    },
    [myPlayerId, listenToRoom, postEvent, showToast]
  );

  // JOIN ROOM: Connects immediately and shows lobby while syncing with host
  const joinRoom = useCallback(
    (roomCode: string, playerName: string, avatar: string) => {
      setErrorMessage(null);
      isHostRef.current = false;
      const code = roomCode.trim().toUpperCase();
      currentRoomIdRef.current = code;

      const safeName = playerName.trim().slice(0, 16) || 'Player';
      const safeAvatar = avatar || '🐱';

      // Set interim lobby state immediately so guest enters lobby without delay
      const interimRoom: PublicGameState = {
        roomId: code,
        hostId: 'connecting',
        status: 'lobby',
        settings: { ...DEFAULT_RULES },
        players: [
          {
            id: myPlayerId,
            name: safeName,
            avatar: safeAvatar,
            cardCount: 0,
            score: 0,
            roundScore: 0,
            isConnected: true,
            isReady: false,
            isHost: false,
            isSpectator: false,
            calledUno: false,
            mustCallUno: false,
          },
        ],
        topCard: null,
        currentColor: null,
        currentTurnPlayerId: null,
        direction: 1,
        pendingDrawCount: 0,
        pendingColorChoice: false,
        pendingColorPlayerId: null,
        roundNumber: 1,
        winnerId: null,
        roundWinnerId: null,
        turnExpiresAt: null,
        deckCount: 0,
        discardCount: 0,
        lastAction: {
          id: `act_${Date.now()}`,
          type: 'JOINING',
          playerId: myPlayerId,
          playerName: safeName,
          message: `Connecting to room ${code}...`,
          timestamp: Date.now(),
        },
      };

      setSyncState({
        gameState: interimRoom,
        myHand: [],
        myPlayerId,
        canDraw: false,
        canPass: false,
        canCallUno: false,
        canCatchUnoTargetId: null,
        playableCardIds: [],
      });

      // Start listening to the room
      listenToRoom(code);

      // Ping join request immediately and retry every 1 second until synced
      const sendJoinPing = () => {
        postEvent(code, {
          type: 'CLIENT_ACTION',
          action: {
            type: 'JOIN',
            payload: {
              playerId: myPlayerId,
              name: safeName,
              avatar: safeAvatar,
            },
          },
        });
      };

      sendJoinPing();
      if (joinIntervalRef.current) clearInterval(joinIntervalRef.current);
      joinIntervalRef.current = setInterval(sendJoinPing, 1000);

      showToast(`Joining room ${code}...`);
    },
    [myPlayerId, listenToRoom, postEvent, showToast]
  );

  // START GAME (Host)
  const startGame = useCallback(() => {
    if (!isHostRef.current) return;
    const state = hostGameStateRef.current;
    if (!state) return;

    const active = state.players.filter((p) => !p.isSpectator);
    if (active.length < 2) {
      setErrorMessage('At least 2 players are required to start!');
      return;
    }

    const deck = createUnoDeck();
    const startCards = Math.min(Math.max(state.settings.startingCards || 7, 3), 10);

    for (const p of active) {
      const dealt = deck.splice(0, startCards);
      hostHandsRef.current.set(p.id, dealt);
      p.cardCount = dealt.length;
      p.calledUno = false;
      p.mustCallUno = false;
      p.roundScore = 0;
    }

    let top = deck.pop()!;
    while (top.value === 'wild_draw4') {
      deck.unshift(top);
      top = deck.pop()!;
    }

    hostDeckRef.current = deck;
    hostDiscardRef.current = [top];

    state.status = 'playing';
    state.topCard = top;
    state.currentColor = top.color === 'wild' ? 'red' : (top.color as PlayableColor);
    state.currentTurnPlayerId = active[0].id;
    state.direction = 1;
    state.pendingDrawCount = top.value === 'draw2' ? 2 : 0;
    state.deckCount = deck.length;
    state.discardCount = 1;
    state.turnExpiresAt =
      state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'ROUND_STARTED',
      playerId: active[0].id,
      playerName: 'Game',
      message: `Round ${state.roundNumber} started! Top card is ${top.color.toUpperCase()} ${top.value.toUpperCase()}.`,
      card: top,
      timestamp: Date.now(),
    };

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  }, [hostBroadcastSync]);

  // Client actions
  const playCard = useCallback(
    (cardId: string, chosenColor?: PlayableColor) => {
      if (isHostRef.current) {
        executeHostPlayCard(myPlayerId, cardId, chosenColor);
      } else if (currentRoomIdRef.current) {
        postEvent(currentRoomIdRef.current, {
          type: 'CLIENT_ACTION',
          action: {
            type: 'PLAY_CARD',
            payload: { playerId: myPlayerId, cardId, chosenColor },
          },
        });
      }
      setPendingWildCard(null);
    },
    [myPlayerId, postEvent]
  );

  const chooseColor = useCallback(
    (color: PlayableColor) => {
      if (pendingWildCard) {
        playCard(pendingWildCard.id, color);
      }
    },
    [pendingWildCard, playCard]
  );

  const drawCard = useCallback(() => {
    if (isHostRef.current) {
      executeHostDrawCard(myPlayerId);
    } else if (currentRoomIdRef.current) {
      postEvent(currentRoomIdRef.current, {
        type: 'CLIENT_ACTION',
        action: {
          type: 'DRAW_CARD',
          payload: { playerId: myPlayerId },
        },
      });
    }
  }, [myPlayerId, postEvent]);

  const passTurn = useCallback(() => {
    if (isHostRef.current) {
      executeHostPassTurn(myPlayerId);
    } else if (currentRoomIdRef.current) {
      postEvent(currentRoomIdRef.current, {
        type: 'CLIENT_ACTION',
        action: {
          type: 'PASS_TURN',
          payload: { playerId: myPlayerId },
        },
      });
    }
  }, [myPlayerId, postEvent]);

  const callUno = useCallback(() => {
    if (isHostRef.current) {
      executeHostCallUno(myPlayerId);
    } else if (currentRoomIdRef.current) {
      postEvent(currentRoomIdRef.current, {
        type: 'CLIENT_ACTION',
        action: {
          type: 'CALL_UNO',
          payload: { playerId: myPlayerId },
        },
      });
    }
  }, [myPlayerId, postEvent]);

  const catchUno = useCallback(
    (targetPlayerId: string) => {
      if (isHostRef.current) {
        executeHostCatchUno(myPlayerId, targetPlayerId);
      } else if (currentRoomIdRef.current) {
        postEvent(currentRoomIdRef.current, {
          type: 'CLIENT_ACTION',
          action: {
            type: 'CATCH_UNO',
            payload: { callerId: myPlayerId, targetPlayerId },
          },
        });
      }
    },
    [myPlayerId, postEvent]
  );

  const toggleReady = useCallback(() => {
    if (isHostRef.current) {
      const state = hostGameStateRef.current;
      if (state) {
        const me = state.players.find((p) => p.id === myPlayerId);
        if (me) me.isReady = !me.isReady;
        hostBroadcastSync();
      }
    } else if (currentRoomIdRef.current) {
      postEvent(currentRoomIdRef.current, {
        type: 'CLIENT_ACTION',
        action: {
          type: 'TOGGLE_READY',
          payload: { playerId: myPlayerId },
        },
      });
    }
  }, [myPlayerId, hostBroadcastSync, postEvent]);

  // Host updates room settings (editable right in lobby)
  const updateSettings = useCallback(
    (settings: Partial<GameRules>) => {
      if (!isHostRef.current) return;
      const state = hostGameStateRef.current;
      if (state) {
        state.settings = { ...state.settings, ...settings };
        hostBroadcastSync();
        showToast('Room rules updated!');
      }
    },
    [hostBroadcastSync, showToast]
  );

  const kickPlayer = useCallback(
    (targetId: string) => {
      if (!isHostRef.current) return;
      const state = hostGameStateRef.current;
      if (state) {
        state.players = state.players.filter((p) => p.id !== targetId);
        hostHandsRef.current.delete(targetId);
        hostBroadcastSync();
      }
    },
    [hostBroadcastSync]
  );

  const playAgain = useCallback(() => {
    if (!isHostRef.current) return;
    const state = hostGameStateRef.current;
    if (state) {
      state.roundNumber = state.status === 'game_over' ? 1 : state.roundNumber + 1;
      startGame();
    }
  }, [startGame]);

  const leaveRoom = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (joinIntervalRef.current) {
      clearInterval(joinIntervalRef.current);
      joinIntervalRef.current = null;
    }
    currentRoomIdRef.current = null;
    isHostRef.current = false;
    hostGameStateRef.current = null;
    setSyncState(null);
    setChatMessages([]);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
      if (!currentRoomIdRef.current) return;
      const meName = syncState?.gameState.players.find((p) => p.id === myPlayerId)?.name || 'Player';
      const msg: ChatMessage = {
        id: `msg_${Date.now()}`,
        senderId: myPlayerId,
        senderName: meName,
        text,
        isSystem: false,
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, msg]);
      postEvent(currentRoomIdRef.current, {
        type: 'CHAT',
        payload: msg,
      });
    },
    [myPlayerId, syncState, postEvent]
  );

  return {
    syncState,
    chatMessages,
    isConnected,
    errorMessage,
    setErrorMessage,
    toastMessage,
    pendingWildCard,
    setPendingWildCard,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    updateSettings,
    kickPlayer,
    startGame,
    playCard,
    chooseColor,
    drawCard,
    passTurn,
    callUno,
    catchUno,
    playAgain,
    sendChat,
  };
}
