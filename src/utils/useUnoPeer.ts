import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import {
  Card,
  PlayableColor,
  GameRules,
  PublicPlayer,
  PublicGameState,
  ClientSyncState,
  ChatMessage,
  GameActionLog,
  DEFAULT_RULES,
} from '../../shared/types';
import { createUnoDeck, shuffleDeck, isCardPlayable, calculateHandScore } from '../../shared/unoEngine';
import { soundManager } from './audio';

export function useUnoPeer() {
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

  const peerRef = useRef<Peer | null>(null);
  const hostConnRef = useRef<DataConnection | null>(null);
  const guestConnsRef = useRef<Map<string, DataConnection>>(new Map());

  // Host-authoritative internal state
  const isHostRef = useRef<boolean>(false);
  const internalGameStateRef = useRef<PublicGameState | null>(null);
  const playerHandsRef = useRef<Map<string, Card[]>>(new Map());
  const deckRef = useRef<Card[]>([]);
  const discardPileRef = useRef<Card[]>([]);
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

  // Broadcast helper for Host
  const broadcastToGuests = useCallback((msg: any) => {
    for (const conn of guestConnsRef.current.values()) {
      if (conn.open) {
        conn.send(msg);
      }
    }
  }, []);

  // Sync state dispatcher for Host
  const syncAll = useCallback(() => {
    const state = internalGameStateRef.current;
    if (!state) return;

    // Send personalized sync state to each guest
    for (const [pid, conn] of guestConnsRef.current.entries()) {
      if (conn.open) {
        const guestHand = playerHandsRef.current.get(pid) || [];
        const isTurn = state.currentTurnPlayerId === pid && state.status === 'playing';
        const playableCardIds = isTurn
          ? guestHand
              .filter((c) => isCardPlayable(c, state.topCard, state.currentColor, state.pendingDrawCount, state.settings))
              .map((c) => c.id)
          : [];

        const pObj = state.players.find((p) => p.id === pid);
        const catchTarget = state.players.find(
          (p) => p.id !== pid && p.cardCount === 1 && p.mustCallUno && !p.calledUno
        );

        conn.send({
          type: 'SYNC',
          payload: {
            gameState: state,
            myHand: guestHand,
            myPlayerId: pid,
            canDraw: isTurn && !state.pendingColorChoice,
            canPass: isTurn && !state.pendingColorChoice && state.pendingDrawCount === 0,
            canCallUno: Boolean(pObj && pObj.cardCount <= 2 && !pObj.calledUno),
            canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
            playableCardIds,
          },
        });
      }
    }

    // Update Host's own sync state
    const hostHand = playerHandsRef.current.get(myPlayerId) || [];
    const isTurn = state.currentTurnPlayerId === myPlayerId && state.status === 'playing';
    const playableCardIds = isTurn
      ? hostHand
          .filter((c) => isCardPlayable(c, state.topCard, state.currentColor, state.pendingDrawCount, state.settings))
          .map((c) => c.id)
      : [];

    const hostObj = state.players.find((p) => p.id === myPlayerId);
    const catchTarget = state.players.find(
      (p) => p.id !== myPlayerId && p.cardCount === 1 && p.mustCallUno && !p.calledUno
    );

    setSyncState({
      gameState: state,
      myHand: hostHand,
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
      canCallUno: Boolean(hostObj && hostObj.cardCount <= 2 && !hostObj.calledUno),
      canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
      playableCardIds,
    });
  }, [myPlayerId]);

  // Turn timer manager for Host
  useEffect(() => {
    if (!isHostRef.current || !internalGameStateRef.current) return;
    const state = internalGameStateRef.current;
    if (state.status !== 'playing' || !state.turnExpiresAt) return;

    const timer = setInterval(() => {
      if (Date.now() >= state.turnExpiresAt!) {
        // Auto timeout
        handleTurnTimeout();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleTurnTimeout = () => {
    const state = internalGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const curPlayer = state.players.find((p) => p.id === state.currentTurnPlayerId);
    if (!curPlayer) return;

    // Draw card if needed and pass turn
    const curHand = playerHandsRef.current.get(curPlayer.id) || [];
    if (deckRef.current.length > 0) {
      const drawn = deckRef.current.pop()!;
      curHand.push(drawn);
      curPlayer.cardCount = curHand.length;
    }

    // Advance turn
    const active = state.players.filter((p) => !p.isSpectator);
    const curIdx = active.findIndex((p) => p.id === curPlayer.id);
    let nextIdx = curIdx + state.direction;
    while (nextIdx < 0) nextIdx += active.length;
    const nextPlayer = active[nextIdx % active.length];

    state.currentTurnPlayerId = nextPlayer.id;
    state.turnExpiresAt = state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'TIMEOUT',
      playerId: curPlayer.id,
      playerName: curPlayer.name,
      message: `${curPlayer.name}'s turn timed out and passed.`,
      timestamp: Date.now(),
    };

    syncAll();
  };

  // CREATE ROOM (Host)
  const createRoom = useCallback(
    (playerName: string, avatar: string, settings?: Partial<GameRules>) => {
      setErrorMessage(null);
      isHostRef.current = true;
      setIsConnected(true);
      const roomId = generateRoomCode();
      const peerId = `unogame-${roomId}`;

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

      // Set synchronous state so room code appears in 0 milliseconds
      internalGameStateRef.current = initialRoom;
      playerHandsRef.current.set(myPlayerId, []);
      syncAll();
      showToast(`Room ${roomId} created! Share code with friends.`);

      try {
        if (peerRef.current) peerRef.current.destroy();

        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });
        peerRef.current = peer;

        peer.on('open', () => {
          setIsConnected(true);
        });

        // Guest connects
        peer.on('connection', (conn) => {
          conn.on('data', (data: any) => {
            handleHostIncomingMessage(conn, data);
          });

          conn.on('close', () => {
            const guestId = (conn as any).playerId;
            if (guestId && internalGameStateRef.current) {
              const state = internalGameStateRef.current;
              state.players = state.players.filter((p) => p.id !== guestId);
              guestConnsRef.current.delete(guestId);
              playerHandsRef.current.delete(guestId);
              syncAll();
            }
          });
        });

        peer.on('error', (err) => {
          console.error('Peer error:', err);
          if (err.type === 'unavailable-id') {
            // Retry with new code
            createRoom(playerName, avatar, settings);
          } else {
            setErrorMessage(`Room error: ${err.message}`);
          }
        });
      } catch (err: any) {
        console.error('Error creating peer:', err);
        setErrorMessage(`Could not create room: ${err.message}`);
      }
    },
    [myPlayerId, syncAll, showToast]
  );

  // Host handles guest messages
  const handleHostIncomingMessage = (conn: DataConnection, data: any) => {
    const state = internalGameStateRef.current;
    if (!state) return;

    switch (data.type) {
      case 'JOIN': {
        const { playerId, name, avatar } = data.payload;
        (conn as any).playerId = playerId;
        guestConnsRef.current.set(playerId, conn);

        if (state.players.length >= state.settings.maxPlayers && state.status === 'lobby') {
          conn.send({ type: 'ERROR', payload: 'Room is full' });
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
        playerHandsRef.current.set(playerId, []);

        state.lastAction = {
          id: `act_${Date.now()}`,
          type: 'PLAYER_JOINED',
          playerId,
          playerName: newPlayer.name,
          message: `${newPlayer.name} joined the room!`,
          timestamp: Date.now(),
        };

        syncAll();
        broadcastToGuests({
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
        const pid = (conn as any).playerId;
        const player = state.players.find((p) => p.id === pid);
        if (player) {
          player.isReady = !player.isReady;
          syncAll();
        }
        break;
      }

      case 'PLAY_CARD': {
        const { cardId, chosenColor } = data.payload;
        const pid = (conn as any).playerId;
        executePlayCard(pid, cardId, chosenColor);
        break;
      }

      case 'DRAW_CARD': {
        const pid = (conn as any).playerId;
        const drawAll = Boolean(data.payload?.drawAll);
        executeDrawCard(pid, drawAll);
        break;
      }

      case 'PASS_TURN': {
        const pid = (conn as any).playerId;
        executePassTurn(pid);
        break;
      }

      case 'CALL_UNO': {
        const pid = (conn as any).playerId;
        executeCallUno(pid);
        break;
      }

      case 'CATCH_UNO': {
        const pid = (conn as any).playerId;
        const targetId = data.payload.targetPlayerId;
        executeCatchUno(pid, targetId);
        break;
      }

      case 'CHAT': {
        const chatItem: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          senderId: data.payload.senderId,
          senderName: data.payload.senderName,
          text: data.payload.text,
          isSystem: false,
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, chatItem]);
        broadcastToGuests({ type: 'CHAT', payload: chatItem });
        break;
      }
    }
  };

  // Host executes card play
  const executePlayCard = (playerId: string, cardId: string, chosenColor?: PlayableColor) => {
    const state = internalGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const hand = playerHandsRef.current.get(playerId) || [];
    const cardIdx = hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return;
    const card = hand[cardIdx];

    // Remove from hand and push to discard
    hand.splice(cardIdx, 1);
    discardPileRef.current.push(card);
    state.topCard = card;

    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      player.cardCount = hand.length;
      player.mustCallUno = hand.length === 1 && !player.calledUno;
    }

    // Check Win
    if (hand.length === 0) {
      let roundScore = 0;
      const revealed: Record<string, Card[]> = {};
      for (const p of state.players) {
        const h = playerHandsRef.current.get(p.id) || [];
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
      syncAll();
      return;
    }

    // Card Special Effects
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
    state.turnExpiresAt = state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.discardCount = discardPileRef.current.length;

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
    syncAll();
  };

  // Host executes card draw
  const executeDrawCard = (playerId: string, drawAllRemaining = false) => {
    const state = internalGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    if (deckRef.current.length === 0 && discardPileRef.current.length > 1) {
      const top = discardPileRef.current.pop()!;
      deckRef.current = shuffleDeck(discardPileRef.current);
      discardPileRef.current = [top];
    }

    if (deckRef.current.length === 0) return;

    const isPenalty = state.pendingDrawCount > 0;
    // When in penalty, if drawAllRemaining is false, draw 1 card so the player can take cards by their own!
    const count = isPenalty ? (drawAllRemaining ? state.pendingDrawCount : 1) : 1;
    const hand = playerHandsRef.current.get(playerId) || [];
    const drawn = deckRef.current.splice(0, Math.min(count, deckRef.current.length));
    hand.push(...drawn);

    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      player.cardCount = hand.length;
      player.calledUno = false;
      player.mustCallUno = false;
    }

    state.deckCount = deckRef.current.length;

    if (isPenalty) {
      state.pendingDrawCount = Math.max(0, state.pendingDrawCount - drawn.length);
      const isFinished = state.pendingDrawCount === 0;

      state.lastAction = {
        id: `act_${Date.now()}`,
        type: 'PENALTY_DRAW',
        playerId,
        playerName: player?.name || 'Player',
        message: isFinished
          ? `${player?.name || 'Player'} took the final penalty card. Turn passed!`
          : `${player?.name || 'Player'} took a penalty card (${state.pendingDrawCount} left to draw).`,
        timestamp: Date.now(),
      };

      if (isFinished) {
        const active = state.players.filter((p) => !p.isSpectator);
        const curIdx = active.findIndex((p) => p.id === playerId);
        let nextIdx = curIdx + state.direction;
        while (nextIdx < 0) nextIdx += active.length;
        state.currentTurnPlayerId = active[nextIdx % active.length].id;
        state.turnExpiresAt =
          state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
        hasDrawnThisTurnRef.current = false;
      }
    } else {
      state.lastAction = {
        id: `act_${Date.now()}`,
        type: 'DRAW_CARD',
        playerId,
        playerName: player?.name || 'Player',
        message: `${player?.name || 'Player'} drew a card from the deck.`,
        timestamp: Date.now(),
      };

      if (playerId === myPlayerId) {
        hasDrawnThisTurnRef.current = true;
      }
    }

    syncAll();
  };

  // Host executes pass turn
  const executePassTurn = (playerId: string) => {
    const state = internalGameStateRef.current;
    if (!state || state.status !== 'playing') return;

    const active = state.players.filter((p) => !p.isSpectator);
    const curIdx = active.findIndex((p) => p.id === playerId);
    let nextIdx = curIdx + state.direction;
    while (nextIdx < 0) nextIdx += active.length;
    const nextPlayer = active[nextIdx % active.length];

    const player = state.players.find((p) => p.id === playerId);
    state.currentTurnPlayerId = nextPlayer.id;
    state.turnExpiresAt = state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'PASS',
      playerId,
      playerName: player?.name || 'Player',
      message: `${player?.name || 'Player'} passed their turn.`,
      timestamp: Date.now(),
    };

    hasDrawnThisTurnRef.current = false;
    syncAll();
  };

  // Host executes call uno
  const executeCallUno = (playerId: string) => {
    const state = internalGameStateRef.current;
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
    syncAll();
  };

  // Host executes catch uno
  const executeCatchUno = (callerId: string, targetId: string) => {
    const state = internalGameStateRef.current;
    if (!state) return;

    const target = state.players.find((p) => p.id === targetId);
    const caller = state.players.find((p) => p.id === callerId);
    if (!target || !caller || target.cardCount !== 1 || !target.mustCallUno || target.calledUno) return;

    const penalty = state.settings.unoPenaltyCards || 2;
    const targetHand = playerHandsRef.current.get(targetId) || [];
    const drawn = deckRef.current.splice(0, Math.min(penalty, deckRef.current.length));
    targetHand.push(...drawn);

    target.cardCount = targetHand.length;
    target.mustCallUno = false;
    target.calledUno = false;
    state.deckCount = deckRef.current.length;

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'CAUGHT_UNO',
      playerId: callerId,
      playerName: caller.name,
      message: `⚡ ${caller.name} caught ${target.name} forgetting UNO! +${penalty} penalty!`,
      timestamp: Date.now(),
    };
    syncAll();
  };

  // JOIN ROOM (Guest)
  const joinRoom = useCallback(
    (roomCode: string, playerName: string, avatar: string) => {
      setErrorMessage(null);
      isHostRef.current = false;
      setIsConnected(true);
      const code = roomCode.trim().toUpperCase();
      const hostPeerId = `unogame-${code}`;

      const safeName = playerName.trim().slice(0, 16) || 'Player';
      const safeAvatar = avatar || '🐱';

      // Set interim lobby immediately so guest transitions to lobby without waiting
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

      try {
        if (peerRef.current) peerRef.current.destroy();

        const peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });
        peerRef.current = peer;

        peer.on('open', () => {
          const conn = peer.connect(hostPeerId, { reliable: true });
          hostConnRef.current = conn;

          conn.on('open', () => {
            setIsConnected(true);
            conn.send({
              type: 'JOIN',
              payload: {
                playerId: myPlayerId,
                name: safeName,
                avatar: safeAvatar,
              },
            });
            showToast(`Connected to room ${code}!`);
          });

          conn.on('data', (data: any) => {
            if (data.type === 'SYNC') {
              const s: ClientSyncState = data.payload;

              // Sound triggers
              if (s.gameState.lastAction) {
                if (s.gameState.lastAction.type === 'UNO_CALLED') soundManager.playUnoFanfare();
                else if (s.gameState.lastAction.type === 'CARD_PLAYED') soundManager.playCardSnap();
                else if (s.gameState.lastAction.type === 'DRAW_CARD') soundManager.playCardDraw();
                else if (s.gameState.lastAction.type === 'ROUND_WON') soundManager.playWin();
                showToast(s.gameState.lastAction.message);
              }

              if (s.gameState.currentTurnPlayerId === myPlayerId) {
                soundManager.playTurnDing();
              }

              setSyncState(s);
            } else if (data.type === 'CHAT') {
              setChatMessages((prev) => [...prev, data.payload]);
            } else if (data.type === 'ERROR') {
              setErrorMessage(data.payload);
            }
          });

          conn.on('close', () => {
            setErrorMessage('Host closed the room or disconnected.');
            setSyncState(null);
          });
        });

        peer.on('error', (err) => {
          console.error('Peer error:', err);
          setErrorMessage(`Could not find room "${code}". Make sure host is active.`);
        });
      } catch (err: any) {
        setErrorMessage(`Join error: ${err.message}`);
      }
    },
    [myPlayerId, showToast]
  );

  // START GAME (Host)
  const startGame = useCallback(() => {
    if (!isHostRef.current) return;
    const state = internalGameStateRef.current;
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
      playerHandsRef.current.set(p.id, dealt);
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

    deckRef.current = deck;
    discardPileRef.current = [top];

    state.status = 'playing';
    state.topCard = top;
    state.currentColor = top.color === 'wild' ? 'red' : (top.color as PlayableColor);
    state.currentTurnPlayerId = active[0].id;
    state.direction = 1;
    state.pendingDrawCount = top.value === 'draw2' ? 2 : 0;
    state.deckCount = deck.length;
    state.discardCount = 1;
    state.turnExpiresAt = state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;

    state.lastAction = {
      id: `act_${Date.now()}`,
      type: 'ROUND_STARTED',
      playerId: active[0].id,
      playerName: 'Game',
      message: `Round ${state.roundNumber} started! Top card is ${top.color.toUpperCase()} ${top.value.toUpperCase()}.`,
      card: top,
      timestamp: Date.now(),
    };

    syncAll();
  }, [syncAll]);

  // Client actions
  const playCard = useCallback(
    (cardId: string, chosenColor?: PlayableColor) => {
      if (isHostRef.current) {
        executePlayCard(myPlayerId, cardId, chosenColor);
      } else {
        hostConnRef.current?.send({
          type: 'PLAY_CARD',
          payload: { cardId, chosenColor },
        });
      }
      setPendingWildCard(null);
    },
    [myPlayerId]
  );

  const chooseColor = useCallback(
    (color: PlayableColor) => {
      if (pendingWildCard) {
        playCard(pendingWildCard.id, color);
      }
    },
    [pendingWildCard, playCard]
  );

  const drawCard = useCallback(
    (drawAll = false) => {
      if (isHostRef.current) {
        executeDrawCard(myPlayerId, drawAll);
      } else {
        hostConnRef.current?.send({ type: 'DRAW_CARD', payload: { drawAll } });
      }
    },
    [myPlayerId]
  );

  const passTurn = useCallback(() => {
    if (isHostRef.current) {
      executePassTurn(myPlayerId);
    } else {
      hostConnRef.current?.send({ type: 'PASS_TURN' });
    }
  }, [myPlayerId]);

  const callUno = useCallback(() => {
    if (isHostRef.current) {
      executeCallUno(myPlayerId);
    } else {
      hostConnRef.current?.send({ type: 'CALL_UNO' });
    }
  }, [myPlayerId]);

  const catchUno = useCallback((targetPlayerId: string) => {
    if (isHostRef.current) {
      executeCatchUno(myPlayerId, targetPlayerId);
    } else {
      hostConnRef.current?.send({
        type: 'CATCH_UNO',
        payload: { targetPlayerId },
      });
    }
  }, [myPlayerId]);

  const toggleReady = useCallback(() => {
    if (isHostRef.current) {
      const state = internalGameStateRef.current;
      if (state) {
        const me = state.players.find((p) => p.id === myPlayerId);
        if (me) me.isReady = !me.isReady;
        syncAll();
      }
    } else {
      hostConnRef.current?.send({ type: 'TOGGLE_READY' });
    }
  }, [myPlayerId, syncAll]);

  const updateSettings = useCallback(
    (settings: Partial<GameRules>) => {
      if (!isHostRef.current) return;
      const state = internalGameStateRef.current;
      if (state) {
        state.settings = { ...state.settings, ...settings };
        syncAll();
      }
    },
    [syncAll]
  );

  const kickPlayer = useCallback(
    (targetId: string) => {
      if (!isHostRef.current) return;
      const state = internalGameStateRef.current;
      if (state) {
        state.players = state.players.filter((p) => p.id !== targetId);
        const conn = guestConnsRef.current.get(targetId);
        if (conn) {
          conn.send({ type: 'ERROR', payload: 'You were kicked by the host' });
          conn.close();
          guestConnsRef.current.delete(targetId);
        }
        syncAll();
      }
    },
    [syncAll]
  );

  const playAgain = useCallback(() => {
    if (!isHostRef.current) return;
    const state = internalGameStateRef.current;
    if (state) {
      state.roundNumber = state.status === 'game_over' ? 1 : state.roundNumber + 1;
      startGame();
    }
  }, [startGame]);

  const leaveRoom = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setSyncState(null);
    setChatMessages([]);
  }, []);

  const sendChat = useCallback(
    (text: string) => {
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

      if (isHostRef.current) {
        broadcastToGuests({ type: 'CHAT', payload: msg });
      } else {
        hostConnRef.current?.send({
          type: 'CHAT',
          payload: { senderId: myPlayerId, senderName: meName, text },
        });
      }
    },
    [myPlayerId, syncState, broadcastToGuests]
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
