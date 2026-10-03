import { useState, useEffect, useRef, useCallback } from 'react';
import mqtt, { MqttClient } from 'mqtt';
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

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];

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

  const clientRef = useRef<MqttClient | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const isHostRef = useRef<boolean>(false);

  // Host-authoritative in-memory state
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

  // Helper to publish MQTT messages
  const publish = useCallback((topic: string, message: any) => {
    if (clientRef.current && clientRef.current.connected) {
      clientRef.current.publish(topic, JSON.stringify(message), { qos: 1 });
    }
  }, []);

  // Host broadcast full sync state
  const hostBroadcastSync = useCallback(() => {
    const state = hostGameStateRef.current;
    if (!state) return;

    // Send targeted sync to each player
    for (const player of state.players) {
      const pHand = hostHandsRef.current.get(player.id) || [];
      const isTurn = state.currentTurnPlayerId === player.id && state.status === 'playing';
      const playableCardIds = isTurn
        ? pHand
            .filter((c) => isCardPlayable(c, state.topCard, state.currentColor, state.pendingDrawCount, state.settings))
            .map((c) => c.id)
        : [];

      const catchTarget = state.players.find(
        (p) => p.id !== player.id && p.cardCount === 1 && p.mustCallUno && !p.calledUno
      );

      const clientSync: ClientSyncState = {
        gameState: state,
        myHand: pHand,
        myPlayerId: player.id,
        canDraw: Boolean(isTurn && !state.pendingColorChoice && (state.pendingDrawCount > 0 || !hasDrawnThisTurnRef.current || state.settings.drawUntilPlayable)),
        canPass: Boolean(isTurn && !state.pendingColorChoice && state.pendingDrawCount === 0 && hasDrawnThisTurnRef.current),
        canCallUno: Boolean(player.cardCount <= 2 && !player.calledUno),
        canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
        playableCardIds,
      };

      if (player.id === myPlayerId) {
        setSyncState(clientSync);
      }

      // Publish targeted state for guest
      publish(`unolive/v1/rooms/${state.roomId}/sync/${player.id}`, clientSync);
    }
  }, [myPlayerId, publish]);

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

    // Auto draw card if needed
    if (hostDeckRef.current.length > 0) {
      const drawn = hostDeckRef.current.pop()!;
      const curHand = hostHandsRef.current.get(curPlayer.id) || [];
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

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  };

  // Connect to MQTT Broker
  const connectBroker = useCallback((roomId: string, brokerIndex = 0) => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }

    const brokerUrl = BROKERS[brokerIndex % BROKERS.length];
    const clientId = `uno_${myPlayerId}_${Math.random().toString(36).substring(2, 6)}`;

    const client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2500,
    });

    clientRef.current = client;

    client.on('connect', () => {
      setIsConnected(true);
      setErrorMessage(null);

      // Subscribe to room topics
      client.subscribe(`unolive/v1/rooms/${roomId}/#`, (err) => {
        if (!err && !isHostRef.current) {
          // If guest, request to join
          const myName = localStorage.getItem('uno_player_name') || 'Player';
          const myAvatar = localStorage.getItem('uno_avatar') || '🦊';
          publish(`unolive/v1/rooms/${roomId}/client_action`, {
            type: 'JOIN',
            payload: { playerId: myPlayerId, name: myName, avatar: myAvatar },
          });
        }
      });
    });

    client.on('message', (topic: string, messageBuffer: Buffer) => {
      try {
        const payload = JSON.parse(messageBuffer.toString());

        // 1. Guest receiving targeted sync state from Host
        if (topic === `unolive/v1/rooms/${roomId}/sync/${myPlayerId}`) {
          const s = payload as ClientSyncState;

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
        }

        // 2. Chat broadcast
        if (topic === `unolive/v1/rooms/${roomId}/chat`) {
          setChatMessages((prev) => [...prev.slice(-49), payload]);
        }

        // 3. Host handling incoming actions from guests
        if (isHostRef.current && topic === `unolive/v1/rooms/${roomId}/client_action`) {
          handleHostAction(payload);
        }
      } catch (e) {
        console.error('MQTT message error:', e);
      }
    });

    client.on('error', (err) => {
      console.warn('MQTT connection error:', err);
      // Try next broker
      if (brokerIndex < BROKERS.length - 1) {
        connectBroker(roomId, brokerIndex + 1);
      }
    });

    client.on('offline', () => {
      setIsConnected(false);
    });
  }, [myPlayerId, publish, showToast]);

  // Host Action Processor
  const handleHostAction = (action: any) => {
    const state = hostGameStateRef.current;
    if (!state) return;

    switch (action.type) {
      case 'JOIN': {
        const { playerId, name, avatar } = action.payload;
        if (state.players.some((p) => p.id === playerId)) {
          // Already in room, re-sync
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

        // Broadcast chat
        publish(`unolive/v1/rooms/${state.roomId}/chat`, {
          id: `msg_${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          text: `${newPlayer.name} joined the room!`,
          isSystem: true,
          timestamp: Date.now(),
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

      case 'CHAT': {
        publish(`unolive/v1/rooms/${state.roomId}/chat`, action.payload);
        break;
      }
    }
  };

  // Host Card Play Engine
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

    // Win Check
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
    state.turnExpiresAt = state.settings.turnTimerSeconds > 0 ? Date.now() + state.settings.turnTimerSeconds * 1000 : null;
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

  // Host Draw Card Engine
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

  // Host Pass Turn Engine
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
    hostBroadcastSync();
  };

  // Host Call UNO Engine
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

  // Host Catch UNO Engine
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

  // CREATE ROOM: Instantly generates room code and opens lobby
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

      // Set sync state SYNCHRONOUSLY so the room code appears in 0 milliseconds!
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

      // Connect to broker in background
      connectBroker(roomId);
      showToast(`Room ${roomId} created! Share with friends.`);
    },
    [myPlayerId, connectBroker, showToast]
  );

  // JOIN ROOM
  const joinRoom = useCallback(
    (roomCode: string, playerName: string, avatar: string) => {
      setErrorMessage(null);
      isHostRef.current = false;
      const code = roomCode.trim().toUpperCase();
      currentRoomIdRef.current = code;

      // Show temporary loading lobby
      showToast(`Joining room ${code}...`);
      connectBroker(code);
    },
    [connectBroker, showToast]
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

    hasDrawnThisTurnRef.current = false;
    hostBroadcastSync();
  }, [hostBroadcastSync]);

  // Client Play Card
  const playCard = useCallback(
    (cardId: string, chosenColor?: PlayableColor) => {
      if (isHostRef.current) {
        executeHostPlayCard(myPlayerId, cardId, chosenColor);
      } else if (currentRoomIdRef.current) {
        publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
          type: 'PLAY_CARD',
          payload: { playerId: myPlayerId, cardId, chosenColor },
        });
      }
      setPendingWildCard(null);
    },
    [myPlayerId, publish]
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
      publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
        type: 'DRAW_CARD',
        payload: { playerId: myPlayerId },
      });
    }
  }, [myPlayerId, publish]);

  const passTurn = useCallback(() => {
    if (isHostRef.current) {
      executeHostPassTurn(myPlayerId);
    } else if (currentRoomIdRef.current) {
      publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
        type: 'PASS_TURN',
        payload: { playerId: myPlayerId },
      });
    }
  }, [myPlayerId, publish]);

  const callUno = useCallback(() => {
    if (isHostRef.current) {
      executeHostCallUno(myPlayerId);
    } else if (currentRoomIdRef.current) {
      publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
        type: 'CALL_UNO',
        payload: { playerId: myPlayerId },
      });
    }
  }, [myPlayerId, publish]);

  const catchUno = useCallback(
    (targetPlayerId: string) => {
      if (isHostRef.current) {
        executeHostCatchUno(myPlayerId, targetPlayerId);
      } else if (currentRoomIdRef.current) {
        publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
          type: 'CATCH_UNO',
          payload: { callerId: myPlayerId, targetPlayerId },
        });
      }
    },
    [myPlayerId, publish]
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
      publish(`unolive/v1/rooms/${currentRoomIdRef.current}/client_action`, {
        type: 'TOGGLE_READY',
        payload: { playerId: myPlayerId },
      });
    }
  }, [myPlayerId, hostBroadcastSync, publish]);

  const updateSettings = useCallback(
    (settings: Partial<GameRules>) => {
      if (!isHostRef.current) return;
      const state = hostGameStateRef.current;
      if (state) {
        state.settings = { ...state.settings, ...settings };
        hostBroadcastSync();
      }
    },
    [hostBroadcastSync]
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
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
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
      publish(`unolive/v1/rooms/${currentRoomIdRef.current}/chat`, msg);
    },
    [myPlayerId, syncState, publish]
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
