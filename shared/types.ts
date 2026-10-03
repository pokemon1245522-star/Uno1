export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type PlayableColor = 'red' | 'blue' | 'green' | 'yellow';
export type CardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
  scoreValue: number;
}

export interface GameRules {
  maxPlayers: number; // 2 - 8
  startingCards: number; // 3 - 10, default 7
  drawUntilPlayable: boolean; // default false
  stackingDraw: boolean; // default true (+2 on +2, wild+4 on +4)
  jumpIn: boolean; // default false
  sevenZero: boolean; // default false (7 swaps hand, 0 all rotate)
  forcePlay: boolean; // default false
  unoPenaltyCards: number; // default 2
  turnTimerSeconds: number; // default 25, 0 = no timer
  targetScore: number; // default 250
}

export const DEFAULT_RULES: GameRules = {
  maxPlayers: 8,
  startingCards: 7,
  drawUntilPlayable: false,
  stackingDraw: true,
  jumpIn: false,
  sevenZero: false,
  forcePlay: false,
  unoPenaltyCards: 2,
  turnTimerSeconds: 25,
  targetScore: 250,
};

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  cardCount: number;
  score: number;
  roundScore: number;
  isConnected: boolean;
  isReady: boolean;
  isHost: boolean;
  isSpectator: boolean;
  calledUno: boolean;
  mustCallUno: boolean;
  lastActionText?: string;
}

export type GameStatus = 'lobby' | 'playing' | 'round_ended' | 'game_over';

export interface GameActionLog {
  id: string;
  type: string;
  playerId: string;
  playerName: string;
  message: string;
  card?: Card;
  timestamp: number;
}

export interface PublicGameState {
  roomId: string;
  hostId: string;
  status: GameStatus;
  settings: GameRules;
  players: PublicPlayer[];
  topCard: Card | null;
  currentColor: PlayableColor | null;
  currentTurnPlayerId: string | null;
  direction: 1 | -1;
  pendingDrawCount: number;
  pendingColorChoice: boolean;
  pendingColorPlayerId: string | null;
  roundNumber: number;
  winnerId: string | null;
  roundWinnerId: string | null;
  turnExpiresAt: number | null;
  deckCount: number;
  discardCount: number;
  lastAction: GameActionLog | null;
  revealedHands?: Record<string, Card[]>;
}

export interface ClientSyncState {
  gameState: PublicGameState;
  myHand: Card[];
  myPlayerId: string;
  canDraw: boolean;
  canPass: boolean;
  canCallUno: boolean;
  canCatchUnoTargetId: string | null;
  playableCardIds: string[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isSystem: boolean;
  timestamp: number;
}

export type ClientMessage =
  | { type: 'CREATE_ROOM'; payload: { playerName: string; avatar: string; settings?: Partial<GameRules> } }
  | { type: 'JOIN_ROOM'; payload: { roomId: string; playerName: string; avatar: string; token?: string; asSpectator?: boolean } }
  | { type: 'RECONNECT'; payload: { roomId: string; playerId: string; token: string } }
  | { type: 'LEAVE_ROOM' }
  | { type: 'TOGGLE_READY' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<GameRules> }
  | { type: 'KICK_PLAYER'; payload: { targetPlayerId: string } }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARD'; payload: { cardId: string; chosenColor?: PlayableColor } }
  | { type: 'DRAW_CARD' }
  | { type: 'PASS_TURN' }
  | { type: 'CALL_UNO' }
  | { type: 'CATCH_UNO'; payload: { targetPlayerId: string } }
  | { type: 'CHOOSE_COLOR'; payload: { color: PlayableColor } }
  | { type: 'PLAY_AGAIN' }
  | { type: 'SEND_CHAT'; payload: { text: string } };

export type ServerMessage =
  | { type: 'INIT_SESSION'; payload: { playerId: string; token: string } }
  | { type: 'ROOM_JOINED'; payload: { roomId: string; playerId: string } }
  | { type: 'SYNC_STATE'; payload: ClientSyncState }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'GAME_EVENT'; payload: { event: string; text: string; sound?: string; data?: any } }
  | { type: 'ERROR'; payload: { message: string; code?: string } };
