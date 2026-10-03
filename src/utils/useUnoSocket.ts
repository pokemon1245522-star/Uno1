import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ClientMessage,
  ServerMessage,
  ClientSyncState,
  ChatMessage,
  GameRules,
  PlayableColor,
  Card,
} from '../../shared/types';
import { soundManager } from './audio';

export function useUnoSocket() {
  const [syncState, setSyncState] = useState<ClientSyncState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingWildCard, setPendingWildCard] = useState<Card | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentRoomIdRef = useRef<string | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // Restore stored session if exists
  useEffect(() => {
    try {
      const savedPid = localStorage.getItem('uno_player_id');
      const savedTok = localStorage.getItem('uno_token');
      const savedRid = localStorage.getItem('uno_room_id');
      if (savedPid) playerIdRef.current = savedPid;
      if (savedTok) tokenRef.current = savedTok;
      if (savedRid) currentRoomIdRef.current = savedRid;
    } catch (e) {
      // ignore
    }
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let wsHost = window.location.host;
    let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // If accessed from Vercel, Netlify, or external domain, connect to the Cloud Run server:
    if (
      window.location.hostname !== 'localhost' &&
      !window.location.hostname.includes('run.app')
    ) {
      wsHost = 'ais-pre-rgujx5tkhz2nbhxu6qpfdr-868365446847.asia-southeast1.run.app';
      wsProtocol = 'wss:';
    }

    const wsUrl = `${wsProtocol}//${wsHost}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setErrorMessage(null);

      // Try reconnecting to previous room if we have credentials
      if (currentRoomIdRef.current && playerIdRef.current && tokenRef.current) {
        ws.send(
          JSON.stringify({
            type: 'RECONNECT',
            payload: {
              roomId: currentRoomIdRef.current,
              playerId: playerIdRef.current,
              token: tokenRef.current,
            },
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'INIT_SESSION': {
            playerIdRef.current = msg.payload.playerId;
            tokenRef.current = msg.payload.token;
            localStorage.setItem('uno_player_id', msg.payload.playerId);
            localStorage.setItem('uno_token', msg.payload.token);
            break;
          }

          case 'ROOM_JOINED': {
            currentRoomIdRef.current = msg.payload.roomId;
            localStorage.setItem('uno_room_id', msg.payload.roomId);
            setErrorMessage(null);
            break;
          }

          case 'SYNC_STATE': {
            setSyncState(msg.payload);
            break;
          }

          case 'CHAT_MESSAGE': {
            setChatMessages((prev) => [...prev.slice(-49), msg.payload]);
            break;
          }

          case 'GAME_EVENT': {
            soundManager.playEvent(msg.payload.sound);
            if (msg.payload.text) {
              setToastMessage(msg.payload.text);
              setTimeout(() => setToastMessage(null), 3500);
            }
            break;
          }

          case 'ERROR': {
            setErrorMessage(msg.payload.message);
            soundManager.playError();
            if (msg.payload.code === 'ROOM_NOT_FOUND' || msg.payload.code === 'INVALID_SESSION') {
              // Clear current room
              currentRoomIdRef.current = null;
              localStorage.removeItem('uno_room_id');
              setSyncState(null);
            }
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Auto-reconnect after 2 seconds
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  const send = useCallback(
    (msg: ClientMessage) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        const onOpen = () => {
          ws.send(JSON.stringify(msg));
          ws.removeEventListener('open', onOpen);
        };
        ws.addEventListener('open', onOpen);
      } else {
        connect();
        const checkInterval = setInterval(() => {
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(msg));
            clearInterval(checkInterval);
          }
        }, 100);
        setTimeout(() => clearInterval(checkInterval), 4000);
      }
    },
    [connect]
  );

  const createRoom = useCallback(
    (playerName: string, avatar: string, settings?: Partial<GameRules>) => {
      send({ type: 'CREATE_ROOM', payload: { playerName, avatar, settings } });
    },
    [send]
  );

  const joinRoom = useCallback(
    (roomId: string, playerName: string, avatar: string) => {
      send({
        type: 'JOIN_ROOM',
        payload: {
          roomId,
          playerName,
          avatar,
          token: tokenRef.current || undefined,
        },
      });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'LEAVE_ROOM' });
    currentRoomIdRef.current = null;
    localStorage.removeItem('uno_room_id');
    setSyncState(null);
    setChatMessages([]);
  }, [send]);

  const toggleReady = useCallback(() => {
    send({ type: 'TOGGLE_READY' });
  }, [send]);

  const updateSettings = useCallback(
    (settings: Partial<GameRules>) => {
      send({ type: 'UPDATE_SETTINGS', payload: settings });
    },
    [send]
  );

  const kickPlayer = useCallback(
    (targetPlayerId: string) => {
      send({ type: 'KICK_PLAYER', payload: { targetPlayerId } });
    },
    [send]
  );

  const startGame = useCallback(() => {
    send({ type: 'START_GAME' });
  }, [send]);

  const playCard = useCallback(
    (cardId: string, chosenColor?: PlayableColor) => {
      send({ type: 'PLAY_CARD', payload: { cardId, chosenColor } });
    },
    [send]
  );

  const chooseColor = useCallback(
    (color: PlayableColor) => {
      if (pendingWildCard) {
        // Play the pending wild card with the selected color
        playCard(pendingWildCard.id, color);
        setPendingWildCard(null);
      } else {
        send({ type: 'CHOOSE_COLOR', payload: { color } });
      }
    },
    [send, playCard, pendingWildCard]
  );

  const drawCard = useCallback(() => {
    send({ type: 'DRAW_CARD' });
  }, [send]);

  const passTurn = useCallback(() => {
    send({ type: 'PASS_TURN' });
  }, [send]);

  const callUno = useCallback(() => {
    send({ type: 'CALL_UNO' });
  }, [send]);

  const catchUno = useCallback(
    (targetPlayerId: string) => {
      send({ type: 'CATCH_UNO', payload: { targetPlayerId } });
    },
    [send]
  );

  const playAgain = useCallback(() => {
    send({ type: 'PLAY_AGAIN' });
  }, [send]);

  const sendChat = useCallback(
    (text: string) => {
      send({ type: 'SEND_CHAT', payload: { text } });
    },
    [send]
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
