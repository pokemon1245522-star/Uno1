import { useState, useEffect, useRef, useCallback } from 'react';
import {
  doc,
  collection,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { db, ensureAuth } from '../firebase';
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

export function useUnoFirebase() {
  const [syncState, setSyncState] = useState<ClientSyncState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);

  const [myPlayerId, setMyPlayerId] = useState<string>(() => {
    return localStorage.getItem('uno_player_id') || `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  const [currentRoomId, setCurrentRoomId] = useState<string | null>(() => {
    return localStorage.getItem('uno_room_id') || null;
  });

  const myHandRef = useRef<Card[]>([]);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState<boolean>(false);

  // Initialize auth
  useEffect(() => {
    ensureAuth().then((uid) => {
      if (uid && !localStorage.getItem('uno_player_id')) {
        setMyPlayerId(uid);
        localStorage.setItem('uno_player_id', uid);
      }
    });
  }, []);

  const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Helper to show transient toasts
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Listen to Room Document, Hand Document, and Chat Messages
  useEffect(() => {
    if (!currentRoomId || !myPlayerId) {
      setSyncState(null);
      setChatMessages([]);
      return;
    }

    const roomRef = doc(db, 'rooms', currentRoomId);
    const handRef = doc(db, 'rooms', currentRoomId, 'hands', myPlayerId);
    const messagesQuery = query(
      collection(db, 'rooms', currentRoomId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    let prevTurnId: string | null = null;
    let prevActionId: string | null = null;

    // 1. Listen to Room document
    const unsubRoom = onSnapshot(
      roomRef,
      (docSnap) => {
        setIsConnected(true);
        setErrorMessage(null);

        if (!docSnap.exists()) {
          setErrorMessage('Room no longer exists.');
          setCurrentRoomId(null);
          localStorage.removeItem('uno_room_id');
          setSyncState(null);
          return;
        }

        const data = docSnap.data() as PublicGameState;

        // Sound triggers on state changes
        if (data.lastAction && data.lastAction.id !== prevActionId) {
          prevActionId = data.lastAction.id;
          if (data.lastAction.type === 'UNO_CALLED') {
            soundManager.playUnoFanfare();
          } else if (data.lastAction.type === 'CARD_PLAYED') {
            soundManager.playCardSnap();
          } else if (data.lastAction.type === 'DRAW_CARD' || data.lastAction.type === 'PENALTY_DRAW') {
            soundManager.playCardDraw();
          } else if (data.lastAction.type === 'ROUND_WON' || data.lastAction.type === 'GAME_OVER') {
            soundManager.playWin();
          }
          showToast(data.lastAction.message);
        }

        if (data.currentTurnPlayerId !== prevTurnId) {
          prevTurnId = data.currentTurnPlayerId;
          if (data.currentTurnPlayerId === myPlayerId) {
            soundManager.playTurnDing();
            setHasDrawnThisTurn(false);
          }
        }

        // Calculate playable cards
        const isTurn = data.currentTurnPlayerId === myPlayerId && data.status === 'playing';
        const playableCardIds: string[] = [];

        if (isTurn) {
          for (const card of myHandRef.current) {
            if (isCardPlayable(card, data.topCard, data.currentColor, data.pendingDrawCount, data.settings)) {
              playableCardIds.push(card.id);
            }
          }
        } else if (data.settings.jumpIn && data.status === 'playing' && data.topCard) {
          for (const card of myHandRef.current) {
            if (card.value === data.topCard.value && card.color === data.currentColor) {
              playableCardIds.push(card.id);
            }
          }
        }

        const playerObj = data.players.find((p) => p.id === myPlayerId);
        const canDraw = Boolean(
          isTurn &&
          !data.pendingColorChoice &&
          (data.pendingDrawCount > 0 || !hasDrawnThisTurn || data.settings.drawUntilPlayable)
        );
        const canPass = Boolean(
          isTurn &&
          !data.pendingColorChoice &&
          data.pendingDrawCount === 0 &&
          hasDrawnThisTurn
        );
        const canCallUno = Boolean(playerObj && playerObj.cardCount <= 2 && !playerObj.calledUno);
        const catchTarget = data.players.find(
          (p) => p.id !== myPlayerId && p.cardCount === 1 && p.mustCallUno && !p.calledUno
        );

        setSyncState({
          gameState: data,
          myHand: myHandRef.current,
          myPlayerId,
          canDraw,
          canPass,
          canCallUno,
          canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
          playableCardIds,
        });
      },
      (err) => {
        console.error('Firestore room error:', err);
        if (err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
          setErrorMessage(
            'Firebase permission denied. Please allow read/write in your Firestore rules at console.firebase.google.com'
          );
        } else {
          setErrorMessage(`Connection error: ${err.message}`);
        }
        setIsConnected(false);
      }
    );

    // 2. Listen to Player's private hand
    const unsubHand = onSnapshot(
      handRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const handData = docSnap.data();
          const cards: Card[] = handData.cards || [];
          myHandRef.current = cards;
          setMyHand(cards);

          // Update syncState with new hand
          setSyncState((prev) => {
            if (!prev) return null;
            const isTurn = prev.gameState.currentTurnPlayerId === myPlayerId && prev.gameState.status === 'playing';
            const playableCardIds: string[] = [];
            if (isTurn) {
              for (const c of cards) {
                if (isCardPlayable(c, prev.gameState.topCard, prev.gameState.currentColor, prev.gameState.pendingDrawCount, prev.gameState.settings)) {
                  playableCardIds.push(c.id);
                }
              }
            }
            return {
              ...prev,
              myHand: cards,
              playableCardIds,
            };
          });
        }
      },
      (err) => {
        console.warn('Error fetching hand from Firestore:', err);
      }
    );

    // 3. Listen to Chat messages
    const unsubMessages = onSnapshot(
      messagesQuery,
      (querySnap) => {
        const msgs: ChatMessage[] = [];
        querySnap.forEach((doc) => {
          const d = doc.data();
          msgs.push({
            id: doc.id,
            senderId: d.senderId,
            senderName: d.senderName,
            text: d.text,
            isSystem: d.isSystem || false,
            timestamp: d.timestamp || Date.now(),
          });
        });
        setChatMessages(msgs);
      },
      (err) => {
        console.warn('Chat listener error:', err);
      }
    );

    return () => {
      unsubRoom();
      unsubHand();
      unsubMessages();
    };
  }, [currentRoomId, myPlayerId, hasDrawnThisTurn, showToast]);

  // Turn timer countdown effect on client
  useEffect(() => {
    if (!syncState || syncState.gameState.status !== 'playing' || !syncState.gameState.turnExpiresAt) {
      return;
    }

    const checkTimeout = () => {
      if (Date.now() >= syncState.gameState.turnExpiresAt!) {
        // If it's my turn and expired, auto-draw and pass
        if (syncState.gameState.currentTurnPlayerId === myPlayerId) {
          handleAutoTimeout();
        }
      }
    };

    const timer = setInterval(checkTimeout, 1000);
    return () => clearInterval(timer);
  }, [syncState, myPlayerId]);

  const handleAutoTimeout = async () => {
    if (!currentRoomId || !syncState) return;
    try {
      if (syncState.canDraw) {
        await drawCard();
      }
      await passTurn();
    } catch (e) {
      console.error('Error handling auto timeout:', e);
    }
  };

  // CREATE ROOM
  const createRoom = async (playerName: string, avatar: string, settings?: Partial<GameRules>) => {
    try {
      setErrorMessage(null);
      const roomId = generateRoomCode();
      const hostId = myPlayerId;

      const newPlayer: PublicPlayer = {
        id: hostId,
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
        hostId,
        status: 'lobby',
        settings: { ...DEFAULT_RULES, ...settings },
        players: [newPlayer],
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
          playerId: hostId,
          playerName: newPlayer.name,
          message: `Room ${roomId} created! Share this code with friends.`,
          timestamp: Date.now(),
        },
      };

      await setDoc(doc(db, 'rooms', roomId), initialRoom);
      await setDoc(doc(db, 'rooms', roomId, 'hands', hostId), { cards: [] });
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderId: 'system',
        senderName: 'System',
        text: `Room ${roomId} created! Share the code to invite friends.`,
        isSystem: true,
        timestamp: Date.now(),
      });

      setCurrentRoomId(roomId);
      localStorage.setItem('uno_room_id', roomId);
    } catch (err: any) {
      console.error('Failed to create room:', err);
      setErrorMessage(
        err.message?.includes('permission-denied')
          ? 'Firestore permission denied. Please allow read/write in your Firestore rules at console.firebase.google.com'
          : `Failed to create room: ${err.message}`
      );
    }
  };

  // JOIN ROOM
  const joinRoom = async (roomIdToJoin: string, playerName: string, avatar: string) => {
    try {
      setErrorMessage(null);
      const roomId = roomIdToJoin.trim().toUpperCase();
      const roomSnap = await getDoc(doc(db, 'rooms', roomId));

      if (!roomSnap.exists()) {
        setErrorMessage(`Room "${roomId}" not found. Please check the code and try again.`);
        return;
      }

      const roomData = roomSnap.data() as PublicGameState;
      const safeName = playerName.trim().slice(0, 16) || 'Player';

      const existingPlayerIndex = roomData.players.findIndex((p) => p.id === myPlayerId);
      let updatedPlayers = [...roomData.players];

      if (existingPlayerIndex !== -1) {
        // Reconnection
        updatedPlayers[existingPlayerIndex] = {
          ...updatedPlayers[existingPlayerIndex],
          name: safeName,
          avatar: avatar || updatedPlayers[existingPlayerIndex].avatar,
          isConnected: true,
        };
      } else {
        // New player
        if (roomData.status !== 'lobby') {
          setErrorMessage('Game already in progress.');
          return;
        }

        if (roomData.players.length >= roomData.settings.maxPlayers) {
          setErrorMessage(`Room is full (${roomData.settings.maxPlayers} max players).`);
          return;
        }

        const newPlayer: PublicPlayer = {
          id: myPlayerId,
          name: safeName,
          avatar: avatar || '🐱',
          cardCount: 0,
          score: 0,
          roundScore: 0,
          isConnected: true,
          isReady: false,
          isHost: false,
          isSpectator: false,
          calledUno: false,
          mustCallUno: false,
        };

        updatedPlayers.push(newPlayer);
        await setDoc(doc(db, 'rooms', roomId, 'hands', myPlayerId), { cards: [] });
      }

      await updateDoc(doc(db, 'rooms', roomId), {
        players: updatedPlayers,
        lastAction: {
          id: `act_${Date.now()}`,
          type: 'PLAYER_JOINED',
          playerId: myPlayerId,
          playerName: safeName,
          message: `${safeName} joined the room!`,
          timestamp: Date.now(),
        },
      });

      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderId: 'system',
        senderName: 'System',
        text: `${safeName} joined the game!`,
        isSystem: true,
        timestamp: Date.now(),
      });

      setCurrentRoomId(roomId);
      localStorage.setItem('uno_room_id', roomId);
    } catch (err: any) {
      console.error('Failed to join room:', err);
      setErrorMessage(
        err.message?.includes('permission-denied')
          ? 'Firestore permission denied. Please allow read/write in your Firestore rules.'
          : `Failed to join room: ${err.message}`
      );
    }
  };

  // LEAVE ROOM
  const leaveRoom = async () => {
    if (!currentRoomId) return;
    try {
      const roomSnap = await getDoc(doc(db, 'rooms', currentRoomId));
      if (roomSnap.exists()) {
        const roomData = roomSnap.data() as PublicGameState;
        const updatedPlayers = roomData.players.filter((p) => p.id !== myPlayerId);

        if (updatedPlayers.length === 0) {
          await deleteDoc(doc(db, 'rooms', currentRoomId));
        } else {
          let newHostId = roomData.hostId;
          if (roomData.hostId === myPlayerId) {
            newHostId = updatedPlayers[0].id;
            updatedPlayers[0].isHost = true;
          }

          await updateDoc(doc(db, 'rooms', currentRoomId), {
            players: updatedPlayers,
            hostId: newHostId,
            lastAction: {
              id: `act_${Date.now()}`,
              type: 'PLAYER_LEFT',
              playerId: myPlayerId,
              playerName: 'Player',
              message: `A player left the room.`,
              timestamp: Date.now(),
            },
          });
        }
      }
    } catch (err) {
      console.warn('Error leaving room:', err);
    } finally {
      setCurrentRoomId(null);
      localStorage.removeItem('uno_room_id');
      setSyncState(null);
      setChatMessages([]);
    }
  };

  // TOGGLE READY
  const toggleReady = async () => {
    if (!currentRoomId || !syncState) return;
    const updatedPlayers = syncState.gameState.players.map((p) => {
      if (p.id === myPlayerId) {
        return { ...p, isReady: !p.isReady };
      }
      return p;
    });
    await updateDoc(doc(db, 'rooms', currentRoomId), { players: updatedPlayers });
  };

  // UPDATE SETTINGS
  const updateSettings = async (settings: Partial<GameRules>) => {
    if (!currentRoomId || !syncState || syncState.gameState.hostId !== myPlayerId) return;
    await updateDoc(doc(db, 'rooms', currentRoomId), {
      settings: { ...syncState.gameState.settings, ...settings },
    });
  };

  // KICK PLAYER
  const kickPlayer = async (targetId: string) => {
    if (!currentRoomId || !syncState || syncState.gameState.hostId !== myPlayerId) return;
    const target = syncState.gameState.players.find((p) => p.id === targetId);
    const updatedPlayers = syncState.gameState.players.filter((p) => p.id !== targetId);
    await updateDoc(doc(db, 'rooms', currentRoomId), {
      players: updatedPlayers,
      lastAction: {
        id: `act_${Date.now()}`,
        type: 'PLAYER_KICKED',
        playerId: targetId,
        playerName: target?.name || 'Player',
        message: `${target?.name || 'Player'} was removed by host.`,
        timestamp: Date.now(),
      },
    });
  };

  // START GAME / ROUND
  const startGame = async () => {
    if (!currentRoomId || !syncState) return;
    const { gameState } = syncState;
    if (gameState.hostId !== myPlayerId) return;

    const activePlayers = gameState.players.filter((p) => !p.isSpectator);
    if (activePlayers.length < 2) {
      setErrorMessage('At least 2 players are required to start!');
      return;
    }

    const deck = createUnoDeck();
    const startCardsCount = Math.min(Math.max(gameState.settings.startingCards || 7, 3), 10);

    // Deal cards
    const updatedPlayers: PublicPlayer[] = [];
    for (const player of activePlayers) {
      const dealt = deck.splice(0, startCardsCount);
      await setDoc(doc(db, 'rooms', currentRoomId, 'hands', player.id), { cards: dealt });
      updatedPlayers.push({
        ...player,
        cardCount: dealt.length,
        calledUno: false,
        mustCallUno: false,
        roundScore: 0,
      });
    }

    // Flip top card (not Wild Draw 4)
    let initialTop: Card | undefined;
    while (deck.length > 0) {
      const c = deck.pop()!;
      if (c.value === 'wild_draw4') {
        deck.unshift(c);
      } else {
        initialTop = c;
        break;
      }
    }
    if (!initialTop) {
      initialTop = { id: 'c_init', color: 'red', value: '1', scoreValue: 1 };
    }

    const initialColor: PlayableColor =
      initialTop.color === 'wild'
        ? (['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as PlayableColor)
        : (initialTop.color as PlayableColor);

    // Store deck state in Firestore
    await setDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'), {
      deck,
      discardPile: [initialTop],
    });

    const turnDuration = gameState.settings.turnTimerSeconds > 0 ? gameState.settings.turnTimerSeconds * 1000 : null;

    await updateDoc(doc(db, 'rooms', currentRoomId), {
      status: 'playing',
      topCard: initialTop,
      currentColor: initialColor,
      currentTurnPlayerId: updatedPlayers[0].id,
      direction: 1,
      pendingDrawCount: initialTop.value === 'draw2' ? 2 : 0,
      pendingColorChoice: false,
      pendingColorPlayerId: null,
      roundWinnerId: null,
      winnerId: null,
      revealedHands: null,
      turnExpiresAt: turnDuration ? Date.now() + turnDuration : null,
      deckCount: deck.length,
      discardCount: 1,
      players: updatedPlayers,
      lastAction: {
        id: `act_${Date.now()}`,
        type: 'ROUND_STARTED',
        playerId: updatedPlayers[0].id,
        playerName: 'Game',
        message: `Round ${gameState.roundNumber} started! Top card is ${initialTop.color.toUpperCase()} ${initialTop.value.toUpperCase()}.`,
        card: initialTop,
        timestamp: Date.now(),
      },
    });

    await addDoc(collection(db, 'rooms', currentRoomId, 'messages'), {
      senderId: 'system',
      senderName: 'System',
      text: `Round ${gameState.roundNumber} started!`,
      isSystem: true,
      timestamp: Date.now(),
    });
  };

  // Helper to advance turn
  const getNextPlayerId = (
    currentId: string,
    players: PublicPlayer[],
    direction: 1 | -1,
    steps: number = 1
  ): string => {
    const active = players.filter((p) => !p.isSpectator);
    const currentIndex = active.findIndex((p) => p.id === currentId);
    let nextIndex = currentIndex + direction * steps;
    while (nextIndex < 0) nextIndex += active.length;
    return active[nextIndex % active.length].id;
  };

  // PLAY CARD
  const playCard = async (cardId: string, chosenColor?: PlayableColor) => {
    if (!currentRoomId || !syncState) return;
    const { gameState } = syncState;

    const card = myHand.find((c) => c.id === cardId);
    if (!card) return;

    // Check if Wild needs color selection
    if (card.color === 'wild' && !chosenColor) {
      setPendingWildCard(card);
      return;
    }

    try {
      // 1. Update deck & discard in Firestore
      const deckDocSnap = await getDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'));
      const deckData = deckDocSnap.data() || { deck: [], discardPile: [] };
      const discardPile = deckData.discardPile || [];
      discardPile.push(card);

      await updateDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'), {
        discardPile,
      });

      // 2. Remove card from player hand
      const updatedHand = myHand.filter((c) => c.id !== cardId);
      myHandRef.current = updatedHand;
      setMyHand(updatedHand);
      await setDoc(doc(db, 'rooms', currentRoomId, 'hands', myPlayerId), { cards: updatedHand });

      // 3. Check for Win!
      if (updatedHand.length === 0) {
        // Collect all hands to calculate score
        let roundScore = 0;
        const revealed: Record<string, Card[]> = { [myPlayerId]: [] };

        for (const p of gameState.players) {
          if (p.id !== myPlayerId) {
            const hSnap = await getDoc(doc(db, 'rooms', currentRoomId, 'hands', p.id));
            const hCards = (hSnap.data()?.cards as Card[]) || [];
            revealed[p.id] = hCards;
            roundScore += calculateHandScore(hCards);
          }
        }

        const me = gameState.players.find((p) => p.id === myPlayerId);
        const newScore = (me?.score || 0) + roundScore;
        const isGameOver = newScore >= gameState.settings.targetScore;

        const updatedPlayers = gameState.players.map((p) => {
          if (p.id === myPlayerId) {
            return { ...p, score: newScore, roundScore, cardCount: 0 };
          }
          return { ...p, cardCount: revealed[p.id]?.length || 0 };
        });

        await updateDoc(doc(db, 'rooms', currentRoomId), {
          status: isGameOver ? 'game_over' : 'round_ended',
          winnerId: isGameOver ? myPlayerId : null,
          roundWinnerId: myPlayerId,
          revealedHands: revealed,
          players: updatedPlayers,
          lastAction: {
            id: `act_${Date.now()}`,
            type: 'ROUND_WON',
            playerId: myPlayerId,
            playerName: me?.name || 'Player',
            message: `🏆 ${me?.name || 'Player'} won the round! (+${roundScore} points)`,
            timestamp: Date.now(),
          },
        });
        return;
      }

      // Determine next color and special effects
      const newColor: PlayableColor = (chosenColor || (card.color === 'wild' ? 'red' : card.color)) as PlayableColor;
      let newDirection = gameState.direction;
      let skipSteps = 1;
      let newPendingDraw = gameState.pendingDrawCount;
      const activePlayers = gameState.players.filter((p) => !p.isSpectator);

      if (card.value === 'skip') {
        skipSteps = activePlayers.length === 2 ? 0 : 2;
      } else if (card.value === 'reverse') {
        if (activePlayers.length === 2) {
          skipSteps = 0;
        } else {
          newDirection = (newDirection * -1) as 1 | -1;
        }
      } else if (card.value === 'draw2') {
        newPendingDraw = gameState.settings.stackingDraw ? newPendingDraw + 2 : 2;
      } else if (card.value === 'wild_draw4') {
        newPendingDraw = gameState.settings.stackingDraw ? newPendingDraw + 4 : 4;
      }

      const nextPlayerId = skipSteps === 0
        ? myPlayerId
        : getNextPlayerId(myPlayerId, gameState.players, newDirection, skipSteps);

      const me = gameState.players.find((p) => p.id === myPlayerId);
      const updatedPlayers = gameState.players.map((p) => {
        if (p.id === myPlayerId) {
          return {
            ...p,
            cardCount: updatedHand.length,
            mustCallUno: updatedHand.length === 1 && !p.calledUno,
          };
        }
        return p;
      });

      const turnDuration = gameState.settings.turnTimerSeconds > 0 ? gameState.settings.turnTimerSeconds * 1000 : null;

      await updateDoc(doc(db, 'rooms', currentRoomId), {
        topCard: card,
        currentColor: newColor,
        direction: newDirection,
        currentTurnPlayerId: nextPlayerId,
        pendingDrawCount: newPendingDraw,
        pendingColorChoice: false,
        pendingColorPlayerId: null,
        players: updatedPlayers,
        turnExpiresAt: turnDuration ? Date.now() + turnDuration : null,
        discardCount: discardPile.length,
        lastAction: {
          id: `act_${Date.now()}`,
          type: 'CARD_PLAYED',
          playerId: myPlayerId,
          playerName: me?.name || 'Player',
          message: `${me?.name || 'Player'} played ${card.color.toUpperCase()} ${card.value.toUpperCase()}${
            card.color === 'wild' ? ` (Color: ${newColor.toUpperCase()})` : ''
          }`,
          card,
          timestamp: Date.now(),
        },
      });

      setPendingWildCard(null);
    } catch (err: any) {
      console.error('Error playing card:', err);
      setErrorMessage(`Failed to play card: ${err.message}`);
    }
  };

  // CHOOSE COLOR (For Wild)
  const chooseColor = async (color: PlayableColor) => {
    if (pendingWildCard) {
      await playCard(pendingWildCard.id, color);
    }
  };

  // DRAW CARD
  const drawCard = async () => {
    if (!currentRoomId || !syncState) return;
    const { gameState } = syncState;

    try {
      const deckDocSnap = await getDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'));
      const deckData = deckDocSnap.data() || { deck: [], discardPile: [] };
      let currentDeck: Card[] = deckData.deck || [];
      let currentDiscard: Card[] = deckData.discardPile || [];

      // Reshuffle if empty
      if (currentDeck.length === 0 && currentDiscard.length > 1) {
        const top = currentDiscard.pop()!;
        currentDeck = shuffleDeck(currentDiscard);
        currentDiscard = [top];
      }

      if (currentDeck.length === 0) {
        showToast('No cards left to draw!');
        return;
      }

      const drawCount = gameState.pendingDrawCount > 0 ? gameState.pendingDrawCount : 1;
      const drawnCards = currentDeck.splice(0, Math.min(drawCount, currentDeck.length));

      // Update deck state in Firestore
      await updateDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'), {
        deck: currentDeck,
        discardPile: currentDiscard,
      });

      // Update player hand in Firestore
      const newHand = [...myHand, ...drawnCards];
      myHandRef.current = newHand;
      setMyHand(newHand);
      await setDoc(doc(db, 'rooms', currentRoomId, 'hands', myPlayerId), { cards: newHand });

      const me = gameState.players.find((p) => p.id === myPlayerId);
      const isPenalty = gameState.pendingDrawCount > 0;
      const nextPlayerId = isPenalty
        ? getNextPlayerId(myPlayerId, gameState.players, gameState.direction, 1)
        : myPlayerId;

      const updatedPlayers = gameState.players.map((p) => {
        if (p.id === myPlayerId) {
          return {
            ...p,
            cardCount: newHand.length,
            calledUno: false,
            mustCallUno: false,
          };
        }
        return p;
      });

      await updateDoc(doc(db, 'rooms', currentRoomId), {
        deckCount: currentDeck.length,
        players: updatedPlayers,
        pendingDrawCount: 0,
        currentTurnPlayerId: nextPlayerId,
        lastAction: {
          id: `act_${Date.now()}`,
          type: isPenalty ? 'PENALTY_DRAW' : 'DRAW_CARD',
          playerId: myPlayerId,
          playerName: me?.name || 'Player',
          message: `${me?.name || 'Player'} drew ${drawnCards.length} card(s).`,
          timestamp: Date.now(),
        },
      });

      if (!isPenalty) {
        setHasDrawnThisTurn(true);
      }
    } catch (err: any) {
      console.error('Error drawing card:', err);
      setErrorMessage(`Failed to draw card: ${err.message}`);
    }
  };

  // PASS TURN
  const passTurn = async () => {
    if (!currentRoomId || !syncState) return;
    const { gameState } = syncState;
    const nextPlayerId = getNextPlayerId(myPlayerId, gameState.players, gameState.direction, 1);
    const me = gameState.players.find((p) => p.id === myPlayerId);

    const turnDuration = gameState.settings.turnTimerSeconds > 0 ? gameState.settings.turnTimerSeconds * 1000 : null;

    await updateDoc(doc(db, 'rooms', currentRoomId), {
      currentTurnPlayerId: nextPlayerId,
      turnExpiresAt: turnDuration ? Date.now() + turnDuration : null,
      lastAction: {
        id: `act_${Date.now()}`,
        type: 'PASS',
        playerId: myPlayerId,
        playerName: me?.name || 'Player',
        message: `${me?.name || 'Player'} passed their turn.`,
        timestamp: Date.now(),
      },
    });
    setHasDrawnThisTurn(false);
  };

  // CALL UNO
  const callUno = async () => {
    if (!currentRoomId || !syncState) return;
    const me = syncState.gameState.players.find((p) => p.id === myPlayerId);
    if (!me || myHand.length > 2) return;

    const updatedPlayers = syncState.gameState.players.map((p) => {
      if (p.id === myPlayerId) {
        return { ...p, calledUno: true, mustCallUno: false };
      }
      return p;
    });

    await updateDoc(doc(db, 'rooms', currentRoomId), {
      players: updatedPlayers,
      lastAction: {
        id: `act_${Date.now()}`,
        type: 'UNO_CALLED',
        playerId: myPlayerId,
        playerName: me.name,
        message: `🔥 ${me.name} shouted UNO! 🔥`,
        timestamp: Date.now(),
      },
    });
  };

  // CATCH UNO
  const catchUno = async (targetPlayerId: string) => {
    if (!currentRoomId || !syncState) return;
    const target = syncState.gameState.players.find((p) => p.id === targetPlayerId);
    const caller = syncState.gameState.players.find((p) => p.id === myPlayerId);
    if (!target || !caller) return;

    try {
      const deckDocSnap = await getDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'));
      const deckData = deckDocSnap.data() || { deck: [], discardPile: [] };
      const currentDeck: Card[] = deckData.deck || [];
      const penalty = syncState.gameState.settings.unoPenaltyCards || 2;
      const drawnCards = currentDeck.splice(0, Math.min(penalty, currentDeck.length));

      // Update target hand
      const targetHandSnap = await getDoc(doc(db, 'rooms', currentRoomId, 'hands', targetPlayerId));
      const targetCards: Card[] = targetHandSnap.data()?.cards || [];
      const newTargetHand = [...targetCards, ...drawnCards];

      await setDoc(doc(db, 'rooms', currentRoomId, 'hands', targetPlayerId), { cards: newTargetHand });
      await updateDoc(doc(db, 'rooms', currentRoomId, 'deck', 'state'), { deck: currentDeck });

      const updatedPlayers = syncState.gameState.players.map((p) => {
        if (p.id === targetPlayerId) {
          return { ...p, cardCount: newTargetHand.length, mustCallUno: false, calledUno: false };
        }
        return p;
      });

      await updateDoc(doc(db, 'rooms', currentRoomId), {
        players: updatedPlayers,
        deckCount: currentDeck.length,
        lastAction: {
          id: `act_${Date.now()}`,
          type: 'CAUGHT_UNO',
          playerId: myPlayerId,
          playerName: caller.name,
          message: `⚡ ${caller.name} caught ${target.name} forgetting UNO! +${penalty} penalty!`,
          timestamp: Date.now(),
        },
      });
    } catch (err: any) {
      console.error('Error catching UNO:', err);
    }
  };

  // PLAY AGAIN / NEXT ROUND
  const playAgain = async () => {
    if (!currentRoomId || !syncState || syncState.gameState.hostId !== myPlayerId) return;
    const nextRound = syncState.gameState.status === 'game_over' ? 1 : syncState.gameState.roundNumber + 1;
    await updateDoc(doc(db, 'rooms', currentRoomId), {
      roundNumber: nextRound,
    });
    await startGame();
  };

  // SEND CHAT
  const sendChat = async (text: string) => {
    if (!currentRoomId || !syncState || !text.trim()) return;
    const me = syncState.gameState.players.find((p) => p.id === myPlayerId);
    await addDoc(collection(db, 'rooms', currentRoomId, 'messages'), {
      senderId: myPlayerId,
      senderName: me?.name || 'Player',
      text: text.trim().slice(0, 150),
      isSystem: false,
      timestamp: Date.now(),
    });
  };

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
