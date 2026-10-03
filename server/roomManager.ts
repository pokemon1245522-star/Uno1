import { WebSocket } from 'ws';
import { GameInstance, ServerPlayer } from './gameInstance.js';
import {
  ClientMessage,
  ServerMessage,
  ChatMessage,
  GameRules,
  PlayableColor,
} from '../shared/types.js';

interface RoomEntry {
  game: GameInstance;
  sockets: Map<string, WebSocket>; // playerId -> WebSocket
  chat: ChatMessage[];
  lastActivity: number;
}

export class RoomManager {
  private rooms: Map<string, RoomEntry> = new Map();
  private socketToPlayer: Map<WebSocket, { roomId: string; playerId: string }> = new Map();

  constructor() {
    // Cleanup inactive rooms every 5 minutes
    setInterval(() => {
      this.cleanupInactiveRooms();
    }, 5 * 60 * 1000);
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) {
      return this.generateRoomCode();
    }
    return code;
  }

  public handleSocketConnection(ws: WebSocket): void {
    // When a new socket connects, ping/pong or initial handshake can occur
    ws.on('message', (data: string | Buffer) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.handleClientMessage(ws, msg);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
        this.sendError(ws, 'Malformed message format');
      }
    });

    ws.on('close', () => {
      this.handleSocketDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('Socket error:', err);
      this.handleSocketDisconnect(ws);
    });
  }

  private handleSocketDisconnect(ws: WebSocket): void {
    const mapping = this.socketToPlayer.get(ws);
    if (!mapping) return;

    this.socketToPlayer.delete(ws);
    const { roomId, playerId } = mapping;
    const entry = this.rooms.get(roomId);
    if (!entry) return;

    entry.sockets.delete(playerId);
    const player = entry.game.players.find((p) => p.id === playerId);
    if (player) {
      player.isConnected = false;
      entry.lastActivity = Date.now();
      this.broadcastEvent(roomId, 'PLAYER_DISCONNECTED', `${player.name} disconnected.`, 'disconnect');
      this.syncRoom(roomId);
    }
  }

  public handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
      case 'CREATE_ROOM': {
        const { playerName, avatar, settings } = msg.payload;
        const safeName = (playerName || 'Player 1').trim().slice(0, 16);
        const roomId = this.generateRoomCode();
        const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const token = `tok_${Math.random().toString(36).substring(2, 12)}`;

        const hostPlayer: ServerPlayer = {
          id: playerId,
          token,
          name: safeName,
          avatar: avatar || '🦊',
          hand: [],
          score: 0,
          roundScore: 0,
          isConnected: true,
          isReady: true,
          isHost: true,
          isSpectator: false,
          calledUno: false,
          mustCallUno: false,
          hasDrawnThisTurn: false,
          lastActive: Date.now(),
        };

        const game = new GameInstance(
          roomId,
          hostPlayer,
          settings,
          () => this.syncRoom(roomId),
          (event, text, sound, data) => this.broadcastEvent(roomId, event, text, sound, data)
        );

        const entry: RoomEntry = {
          game,
          sockets: new Map([[playerId, ws]]),
          chat: [
            {
              id: `chat_init_${Date.now()}`,
              senderId: 'system',
              senderName: 'System',
              text: `Room ${roomId} created! Share this code with friends to join.`,
              isSystem: true,
              timestamp: Date.now(),
            },
          ],
          lastActivity: Date.now(),
        };

        this.rooms.set(roomId, entry);
        this.socketToPlayer.set(ws, { roomId, playerId });

        // Inform client of session & room join
        this.send(ws, { type: 'INIT_SESSION', payload: { playerId, token } });
        this.send(ws, { type: 'ROOM_JOINED', payload: { roomId, playerId } });
        this.syncRoom(roomId);
        break;
      }

      case 'JOIN_ROOM': {
        const { roomId: rawCode, playerName, avatar, token, asSpectator } = msg.payload;
        const roomId = (rawCode || '').trim().toUpperCase();
        const entry = this.rooms.get(roomId);

        if (!entry) {
          this.sendError(ws, `Room "${roomId}" not found. Check the code and try again.`, 'ROOM_NOT_FOUND');
          return;
        }

        const safeName = (playerName || 'Player').trim().slice(0, 16);

        // Check if player is reconnecting with existing token
        let existingPlayer = token ? entry.game.players.find((p) => p.token === token) : undefined;

        if (existingPlayer) {
          // Reconnection
          existingPlayer.isConnected = true;
          existingPlayer.name = safeName;
          existingPlayer.lastActive = Date.now();
          entry.sockets.set(existingPlayer.id, ws);
          this.socketToPlayer.set(ws, { roomId, playerId: existingPlayer.id });

          this.send(ws, { type: 'INIT_SESSION', payload: { playerId: existingPlayer.id, token: existingPlayer.token } });
          this.send(ws, { type: 'ROOM_JOINED', payload: { roomId, playerId: existingPlayer.id } });
          this.broadcastEvent(roomId, 'PLAYER_RECONNECTED', `${existingPlayer.name} reconnected!`, 'join');
          this.syncRoom(roomId);
          return;
        }

        // New player joining
        if (entry.game.status !== 'lobby' && !asSpectator) {
          // Game already started; let them join as spectator
        } else if (entry.game.players.length >= entry.game.settings.maxPlayers && !asSpectator) {
          this.sendError(ws, `Room is full (${entry.game.settings.maxPlayers} max players).`, 'ROOM_FULL');
          return;
        }

        const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newToken = `tok_${Math.random().toString(36).substring(2, 12)}`;

        const newPlayer: ServerPlayer = {
          id: playerId,
          token: newToken,
          name: safeName,
          avatar: avatar || '🐱',
          hand: [],
          score: 0,
          roundScore: 0,
          isConnected: true,
          isReady: false,
          isHost: false,
          isSpectator: Boolean(asSpectator || entry.game.status !== 'lobby'),
          calledUno: false,
          mustCallUno: false,
          hasDrawnThisTurn: false,
          lastActive: Date.now(),
        };

        entry.game.addPlayer(newPlayer);
        entry.sockets.set(playerId, ws);
        this.socketToPlayer.set(ws, { roomId, playerId });
        entry.lastActivity = Date.now();

        this.send(ws, { type: 'INIT_SESSION', payload: { playerId, token: newToken } });
        this.send(ws, { type: 'ROOM_JOINED', payload: { roomId, playerId } });
        this.syncRoom(roomId);
        break;
      }

      case 'RECONNECT': {
        const { roomId: rawCode, playerId, token } = msg.payload;
        const roomId = (rawCode || '').trim().toUpperCase();
        const entry = this.rooms.get(roomId);

        if (!entry) {
          this.sendError(ws, 'Room no longer exists', 'ROOM_NOT_FOUND');
          return;
        }

        const player = entry.game.players.find((p) => p.id === playerId && p.token === token);
        if (!player) {
          this.sendError(ws, 'Session invalid or player not found', 'INVALID_SESSION');
          return;
        }

        player.isConnected = true;
        player.lastActive = Date.now();
        entry.sockets.set(playerId, ws);
        this.socketToPlayer.set(ws, { roomId, playerId });

        this.send(ws, { type: 'INIT_SESSION', payload: { playerId, token } });
        this.send(ws, { type: 'ROOM_JOINED', payload: { roomId, playerId } });
        this.broadcastEvent(roomId, 'PLAYER_RECONNECTED', `${player.name} reconnected!`, 'join');
        this.syncRoom(roomId);
        break;
      }

      case 'LEAVE_ROOM': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (entry) {
          entry.game.removePlayer(playerId);
          entry.sockets.delete(playerId);
          this.socketToPlayer.delete(ws);
          this.syncRoom(roomId);
        }
        break;
      }

      case 'TOGGLE_READY': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry || entry.game.status !== 'lobby') return;

        const player = entry.game.players.find((p) => p.id === playerId);
        if (player) {
          player.isReady = !player.isReady;
          this.syncRoom(roomId);
        }
        break;
      }

      case 'UPDATE_SETTINGS': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry || entry.game.status !== 'lobby') return;

        if (entry.game.hostId !== playerId) {
          this.sendError(ws, 'Only host can change room settings');
          return;
        }

        entry.game.settings = { ...entry.game.settings, ...msg.payload };
        this.broadcastEvent(roomId, 'SETTINGS_UPDATED', 'Room rules updated by host.', 'settings');
        this.syncRoom(roomId);
        break;
      }

      case 'KICK_PLAYER': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry || entry.game.hostId !== playerId) {
          this.sendError(ws, 'Only host can kick players');
          return;
        }

        const targetId = msg.payload.targetPlayerId;
        const targetSock = entry.sockets.get(targetId);
        if (targetSock) {
          this.sendError(targetSock, 'You were removed from the room by the host.', 'KICKED');
          this.socketToPlayer.delete(targetSock);
          entry.sockets.delete(targetId);
        }
        entry.game.removePlayer(targetId);
        this.syncRoom(roomId);
        break;
      }

      case 'START_GAME': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        if (entry.game.hostId !== playerId) {
          this.sendError(ws, 'Only host can start the game');
          return;
        }

        const activeCount = entry.game.getActivePlayers().length;
        if (activeCount < 2) {
          this.sendError(ws, 'At least 2 players are required to start!');
          return;
        }

        const success = entry.game.startRound();
        if (!success) {
          this.sendError(ws, 'Could not start game');
        }
        break;
      }

      case 'PLAY_CARD': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const res = entry.game.playCard(playerId, msg.payload.cardId, msg.payload.chosenColor);
        if (!res.success) {
          this.sendError(ws, res.error || 'Invalid move');
        }
        break;
      }

      case 'CHOOSE_COLOR': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        entry.game.chooseColor(playerId, msg.payload.color);
        break;
      }

      case 'DRAW_CARD': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const res = entry.game.drawCardAction(playerId);
        if (!res.success) {
          this.sendError(ws, res.error || 'Cannot draw right now');
        }
        break;
      }

      case 'PASS_TURN': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const res = entry.game.passTurn(playerId);
        if (!res.success) {
          this.sendError(ws, res.error || 'Cannot pass');
        }
        break;
      }

      case 'CALL_UNO': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const res = entry.game.callUno(playerId);
        if (!res.success) {
          this.sendError(ws, res.message);
        }
        break;
      }

      case 'CATCH_UNO': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const res = entry.game.catchUno(playerId, msg.payload.targetPlayerId);
        if (!res.success) {
          this.sendError(ws, res.message);
        }
        break;
      }

      case 'PLAY_AGAIN': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        if (entry.game.hostId !== playerId) {
          this.sendError(ws, 'Only host can restart');
          return;
        }

        entry.game.resetForNextRound();
        break;
      }

      case 'SEND_CHAT': {
        const mapping = this.socketToPlayer.get(ws);
        if (!mapping) return;
        const { roomId, playerId } = mapping;
        const entry = this.rooms.get(roomId);
        if (!entry) return;

        const text = (msg.payload.text || '').trim().slice(0, 150);
        if (!text) return;

        const sender = entry.game.players.find((p) => p.id === playerId);
        const chatItem: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          senderId: playerId,
          senderName: sender ? sender.name : 'Unknown',
          text,
          isSystem: false,
          timestamp: Date.now(),
        };

        entry.chat.push(chatItem);
        if (entry.chat.length > 50) {
          entry.chat.shift();
        }

        this.broadcast(roomId, { type: 'CHAT_MESSAGE', payload: chatItem });
        break;
      }
    }
  }

  public syncRoom(roomId: string): void {
    const entry = this.rooms.get(roomId);
    if (!entry) return;

    entry.lastActivity = Date.now();

    for (const [playerId, sock] of entry.sockets.entries()) {
      if (sock.readyState === WebSocket.OPEN) {
        const syncState = entry.game.getClientSyncState(playerId);
        this.send(sock, { type: 'SYNC_STATE', payload: syncState });
      }
    }
  }

  public broadcastEvent(roomId: string, event: string, text: string, sound?: string, data?: any): void {
    const entry = this.rooms.get(roomId);
    if (!entry) return;

    // Add as chat system notification too
    const chatMsg: ChatMessage = {
      id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: 'system',
      senderName: 'System',
      text,
      isSystem: true,
      timestamp: Date.now(),
    };
    entry.chat.push(chatMsg);
    if (entry.chat.length > 50) {
      entry.chat.shift();
    }

    this.broadcast(roomId, { type: 'CHAT_MESSAGE', payload: chatMsg });
    this.broadcast(roomId, {
      type: 'GAME_EVENT',
      payload: { event, text, sound, data },
    });
  }

  public broadcast(roomId: string, message: ServerMessage): void {
    const entry = this.rooms.get(roomId);
    if (!entry) return;

    const json = JSON.stringify(message);
    for (const sock of entry.sockets.values()) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(json);
      }
    }
  }

  public send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public sendError(ws: WebSocket, message: string, code?: string): void {
    this.send(ws, { type: 'ERROR', payload: { message, code } });
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    const timeout = 15 * 60 * 1000; // 15 minutes of zero activity

    for (const [roomId, entry] of this.rooms.entries()) {
      const activeSockets = Array.from(entry.sockets.values()).filter((s) => s.readyState === WebSocket.OPEN);
      if (activeSockets.length === 0 && now - entry.lastActivity > timeout) {
        entry.game.destroy();
        this.rooms.delete(roomId);
        console.log(`Cleaned up inactive room ${roomId}`);
      }
    }
  }
}
