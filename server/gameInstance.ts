import {
  Card,
  CardColor,
  CardValue,
  PlayableColor,
  GameRules,
  PublicPlayer,
  PublicGameState,
  ClientSyncState,
  GameActionLog,
  DEFAULT_RULES,
} from '../shared/types.js';
import { createUnoDeck, shuffleDeck, isCardPlayable, calculateHandScore } from '../shared/unoEngine.js';

export interface ServerPlayer {
  id: string;
  token: string;
  name: string;
  avatar: string;
  hand: Card[];
  score: number;
  roundScore: number;
  isConnected: boolean;
  isReady: boolean;
  isHost: boolean;
  isSpectator: boolean;
  calledUno: boolean;
  mustCallUno: boolean;
  hasDrawnThisTurn: boolean;
  lastActive: number;
  lastActionText?: string;
}

export class GameInstance {
  public roomId: string;
  public hostId: string;
  public status: 'lobby' | 'playing' | 'round_ended' | 'game_over' = 'lobby';
  public settings: GameRules = { ...DEFAULT_RULES };
  public players: ServerPlayer[] = [];
  public deck: Card[] = [];
  public discardPile: Card[] = [];
  public topCard: Card | null = null;
  public currentColor: PlayableColor | null = null;
  public currentTurnIndex: number = 0;
  public direction: 1 | -1 = 1;
  public pendingDrawCount: number = 0;
  public pendingColorChoice: boolean = false;
  public pendingColorPlayerId: string | null = null;
  public roundNumber: number = 1;
  public winnerId: string | null = null;
  public roundWinnerId: string | null = null;
  public turnExpiresAt: number | null = null;
  public lastAction: GameActionLog | null = null;
  public revealedHands: Record<string, Card[]> = {};

  private turnTimer: NodeJS.Timeout | null = null;
  private onStateChange: () => void;
  private onBroadcastEvent: (event: string, text: string, sound?: string, data?: any) => void;

  constructor(
    roomId: string,
    hostPlayer: ServerPlayer,
    settings: Partial<GameRules> | undefined,
    onStateChange: () => void,
    onBroadcastEvent: (event: string, text: string, sound?: string, data?: any) => void
  ) {
    this.roomId = roomId;
    this.hostId = hostPlayer.id;
    this.players = [hostPlayer];
    this.settings = { ...DEFAULT_RULES, ...settings };
    this.onStateChange = onStateChange;
    this.onBroadcastEvent = onBroadcastEvent;
  }

  public getActivePlayers(): ServerPlayer[] {
    return this.players.filter((p) => !p.isSpectator);
  }

  public getCurrentPlayer(): ServerPlayer | null {
    const active = this.getActivePlayers();
    if (active.length === 0) return null;
    return active[this.currentTurnIndex % active.length] || null;
  }

  public startRound(): boolean {
    const active = this.getActivePlayers();
    if (active.length < 2) return false;

    this.status = 'playing';
    this.roundWinnerId = null;
    this.revealedHands = {};
    this.deck = createUnoDeck();
    this.discardPile = [];
    this.direction = 1;
    this.pendingDrawCount = 0;
    this.pendingColorChoice = false;
    this.pendingColorPlayerId = null;

    // Deal cards
    const cardCount = Math.min(Math.max(this.settings.startingCards, 3), 10);
    for (const player of active) {
      player.hand = this.deck.splice(0, cardCount);
      player.calledUno = false;
      player.mustCallUno = false;
      player.hasDrawnThisTurn = false;
      player.roundScore = 0;
    }

    // Flip top card from deck (must not be Wild Draw 4 per official rules)
    let initialTop: Card | undefined;
    while (this.deck.length > 0) {
      const candidate = this.deck.pop()!;
      if (candidate.value === 'wild_draw4') {
        // Return to bottom of deck
        this.deck.unshift(candidate);
      } else {
        initialTop = candidate;
        break;
      }
    }

    if (!initialTop) {
      initialTop = { id: 'init_red_1', color: 'red', value: '1', scoreValue: 1 };
    }

    this.topCard = initialTop;
    this.discardPile.push(initialTop);

    // Initial color
    if (initialTop.color === 'wild') {
      const colors: PlayableColor[] = ['red', 'blue', 'green', 'yellow'];
      this.currentColor = colors[Math.floor(Math.random() * colors.length)];
    } else {
      this.currentColor = initialTop.color as PlayableColor;
    }

    this.currentTurnIndex = 0;
    const firstPlayer = this.getCurrentPlayer()!;

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'ROUND_STARTED',
      playerId: firstPlayer.id,
      playerName: 'Game',
      message: `Round ${this.roundNumber} started! Top card is ${initialTop.color.toUpperCase()} ${initialTop.value.toUpperCase()}.`,
      card: initialTop,
      timestamp: Date.now(),
    };

    // Handle special initial card effects
    if (initialTop.value === 'skip') {
      this.advanceTurn(1);
      this.lastAction.message += ` ${firstPlayer.name} was skipped!`;
    } else if (initialTop.value === 'reverse') {
      if (active.length === 2) {
        this.advanceTurn(1);
      } else {
        this.direction = -1;
        this.currentTurnIndex = active.length - 1;
      }
    } else if (initialTop.value === 'draw2') {
      this.pendingDrawCount = 2;
    }

    this.resetTurnTimer();
    this.onBroadcastEvent('ROUND_START', `Round ${this.roundNumber} has started!`, 'round_start');
    this.onStateChange();
    return true;
  }

  private advanceTurn(steps: number = 1): void {
    const active = this.getActivePlayers();
    if (active.length === 0) return;

    const cur = this.getCurrentPlayer();
    if (cur) {
      cur.hasDrawnThisTurn = false;
    }

    let nextIndex = this.currentTurnIndex + this.direction * steps;
    while (nextIndex < 0) {
      nextIndex += active.length;
    }
    this.currentTurnIndex = nextIndex % active.length;

    this.resetTurnTimer();
  }

  private resetTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    if (this.status !== 'playing' || this.settings.turnTimerSeconds <= 0) {
      this.turnExpiresAt = null;
      return;
    }

    const duration = this.settings.turnTimerSeconds * 1000;
    this.turnExpiresAt = Date.now() + duration;

    this.turnTimer = setTimeout(() => {
      this.handleTurnTimeout();
    }, duration);
  }

  private handleTurnTimeout(): void {
    if (this.status !== 'playing') return;
    const cur = this.getCurrentPlayer();
    if (!cur) return;

    // If pending color choice, pick random color
    if (this.pendingColorChoice && this.pendingColorPlayerId === cur.id) {
      const colors: PlayableColor[] = ['red', 'blue', 'green', 'yellow'];
      const chosen = colors[Math.floor(Math.random() * colors.length)];
      this.chooseColor(cur.id, chosen);
      return;
    }

    // Auto-draw or auto-pass
    if (this.pendingDrawCount > 0) {
      // Must take the stacked draw
      this.drawCards(cur, this.pendingDrawCount);
      this.pendingDrawCount = 0;
      this.advanceTurn(1);
    } else if (!cur.hasDrawnThisTurn) {
      this.drawCards(cur, 1);
      cur.hasDrawnThisTurn = true;
      this.advanceTurn(1);
    } else {
      this.advanceTurn(1);
    }

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'TIMEOUT',
      playerId: cur.id,
      playerName: cur.name,
      message: `${cur.name} ran out of time and passed.`,
      timestamp: Date.now(),
    };

    this.onBroadcastEvent('TURN_TIMEOUT', `${cur.name}'s turn timed out.`, 'turn_change');
    this.onStateChange();
  }

  public drawCards(player: ServerPlayer, count: number): Card[] {
    const drawn: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        // Reshuffle discard pile into deck, preserving top card
        if (this.discardPile.length > 1) {
          const top = this.discardPile.pop()!;
          const cardsToReshuffle = this.discardPile;
          this.discardPile = [top];
          this.deck = shuffleDeck(cardsToReshuffle);
          this.onBroadcastEvent('DECK_RESHUFFLED', 'Discard pile reshuffled into draw deck.', 'shuffle');
        } else {
          // No more cards to draw
          break;
        }
      }

      if (this.deck.length > 0) {
        const card = this.deck.pop()!;
        drawn.push(card);
        player.hand.push(card);
      }
    }

    // Reset uno call if player now has more than 1 card
    if (player.hand.length > 1) {
      player.calledUno = false;
      player.mustCallUno = false;
    }

    return drawn;
  }

  public playCard(playerId: string, cardId: string, chosenColor?: PlayableColor): { success: boolean; error?: string } {
    if (this.status !== 'playing') {
      return { success: false, error: 'Game is not currently active.' };
    }

    const cur = this.getCurrentPlayer();
    if (!cur) {
      return { success: false, error: 'No active player turn.' };
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player) {
      return { success: false, error: 'Player not found.' };
    }

    // Check if Jump-In rule allows playing out of turn
    const isTurn = cur.id === playerId;
    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Card not in hand.' };
    }
    const card = player.hand[cardIndex];

    if (!isTurn) {
      if (this.settings.jumpIn && this.topCard && card.value === this.topCard.value && card.color === this.currentColor) {
        // Valid jump-in!
        const active = this.getActivePlayers();
        const pIndex = active.findIndex((p) => p.id === playerId);
        if (pIndex !== -1) {
          this.currentTurnIndex = pIndex;
        }
      } else {
        return { success: false, error: 'Not your turn.' };
      }
    }

    // Check if playable
    if (!isCardPlayable(card, this.topCard, this.currentColor, this.pendingDrawCount, this.settings)) {
      return { success: false, error: 'This card cannot be played.' };
    }

    // Remove from player hand
    player.hand.splice(cardIndex, 1);
    this.discardPile.push(card);
    this.topCard = card;

    // Check UNO call rule
    if (player.hand.length === 1) {
      // Must call UNO or be subject to catch
      if (!player.calledUno) {
        player.mustCallUno = true;
      }
    } else {
      player.calledUno = false;
      player.mustCallUno = false;
    }

    const active = this.getActivePlayers();

    // Check round win
    if (player.hand.length === 0) {
      this.handleRoundWin(player);
      return { success: true };
    }

    // Handle card effects
    if (card.color === 'wild') {
      if (chosenColor) {
        this.currentColor = chosenColor;
        this.applyCardSpecialEffects(card, player);
      } else {
        // Wait for player to choose color
        this.pendingColorChoice = true;
        this.pendingColorPlayerId = player.id;
        this.lastAction = {
          id: `act_${Date.now()}`,
          type: 'WILD_PLAYED',
          playerId: player.id,
          playerName: player.name,
          message: `${player.name} played Wild and is selecting a color...`,
          card,
          timestamp: Date.now(),
        };
        this.onBroadcastEvent('WILD_PLAYED', `${player.name} is choosing a color.`, 'card_play');
        this.onStateChange();
        return { success: true };
      }
    } else {
      this.currentColor = card.color as PlayableColor;
      this.applyCardSpecialEffects(card, player);
    }

    return { success: true };
  }

  public chooseColor(playerId: string, color: PlayableColor): boolean {
    if (!this.pendingColorChoice || this.pendingColorPlayerId !== playerId) {
      return false;
    }

    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;

    this.currentColor = color;
    this.pendingColorChoice = false;
    this.pendingColorPlayerId = null;

    if (this.topCard) {
      this.applyCardSpecialEffects(this.topCard, player);
    }

    return true;
  }

  private applyCardSpecialEffects(card: Card, player: ServerPlayer): void {
    const active = this.getActivePlayers();
    let message = `${player.name} played ${card.color === 'wild' ? 'Wild' : card.color.toUpperCase()} ${card.value.toUpperCase()}`;

    if (card.color === 'wild') {
      message += ` (Color set to ${this.currentColor?.toUpperCase()})`;
    }

    let skipSteps = 1;

    if (card.value === 'skip') {
      if (active.length === 2) {
        // In 2 player game, skip gives player another turn
        skipSteps = 0;
        message += ` - ${player.name} gets another turn!`;
      } else {
        skipSteps = 2;
        message += ' - Next player skipped!';
      }
    } else if (card.value === 'reverse') {
      if (active.length === 2) {
        // Reverse acts as skip in 2 player UNO
        skipSteps = 0;
        message += ` - Reversed (another turn for ${player.name})!`;
      } else {
        this.direction = (this.direction * -1) as 1 | -1;
        message += ` - Play direction reversed!`;
      }
    } else if (card.value === 'draw2') {
      if (this.settings.stackingDraw) {
        this.pendingDrawCount += 2;
        message += ` - Stack is now +${this.pendingDrawCount}!`;
      } else {
        // Without stacking, next player draws immediately and is skipped
        this.advanceTurn(1);
        const victim = this.getCurrentPlayer()!;
        this.drawCards(victim, 2);
        message += ` - ${victim.name} drew 2 cards and was skipped!`;
      }
    } else if (card.value === 'wild_draw4') {
      if (this.settings.stackingDraw) {
        this.pendingDrawCount += 4;
        message += ` - Stack is now +${this.pendingDrawCount}!`;
      } else {
        this.advanceTurn(1);
        const victim = this.getCurrentPlayer()!;
        this.drawCards(victim, 4);
        message += ` - ${victim.name} drew 4 cards and was skipped!`;
      }
    }

    // Seven-O rule
    if (this.settings.sevenZero && card.value === '0') {
      // Rotate everyone's hands in play direction
      this.rotateHands();
      message += ' - [7-0 Rule] Everyone rotated hands!';
    }

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'CARD_PLAYED',
      playerId: player.id,
      playerName: player.name,
      message,
      card,
      timestamp: Date.now(),
    };

    if (skipSteps > 0) {
      this.advanceTurn(skipSteps);
    } else {
      this.resetTurnTimer();
    }

    this.onBroadcastEvent('CARD_PLAYED', message, 'card_play', { card, color: this.currentColor });
    this.onStateChange();
  }

  private rotateHands(): void {
    const active = this.getActivePlayers();
    if (active.length < 2) return;

    if (this.direction === 1) {
      const lastHand = active[active.length - 1].hand;
      for (let i = active.length - 1; i > 0; i--) {
        active[i].hand = active[i - 1].hand;
      }
      active[0].hand = lastHand;
    } else {
      const firstHand = active[0].hand;
      for (let i = 0; i < active.length - 1; i++) {
        active[i].hand = active[i + 1].hand;
      }
      active[active.length - 1].hand = firstHand;
    }

    for (const p of active) {
      p.calledUno = false;
      p.mustCallUno = p.hand.length === 1;
    }
  }

  public drawCardAction(playerId: string): { success: boolean; drawnCard?: Card; error?: string } {
    if (this.status !== 'playing') {
      return { success: false, error: 'Game not active.' };
    }

    const cur = this.getCurrentPlayer();
    if (!cur || cur.id !== playerId) {
      return { success: false, error: 'Not your turn.' };
    }

    // If there is an active stacking penalty that cannot be countered
    if (this.pendingDrawCount > 0) {
      const drawn = this.drawCards(cur, this.pendingDrawCount);
      const count = this.pendingDrawCount;
      this.pendingDrawCount = 0;
      this.advanceTurn(1);

      this.lastAction = {
        id: `act_${Date.now()}`,
        type: 'PENALTY_DRAW',
        playerId: cur.id,
        playerName: cur.name,
        message: `${cur.name} drew +${count} penalty cards.`,
        timestamp: Date.now(),
      };
      this.onBroadcastEvent('PENALTY_DRAW', `${cur.name} drew +${count} cards!`, 'card_draw');
      this.onStateChange();
      return { success: true };
    }

    if (this.settings.drawUntilPlayable) {
      // Draw until playable
      let drawn: Card[] = [];
      let playable = false;
      while (!playable && this.deck.length + this.discardPile.length > 1) {
        const d = this.drawCards(cur, 1);
        if (d.length === 0) break;
        drawn.push(d[0]);
        if (isCardPlayable(d[0], this.topCard, this.currentColor, 0, this.settings)) {
          playable = true;
          break;
        }
      }
      cur.hasDrawnThisTurn = true;
      this.lastAction = {
        id: `act_${Date.now()}`,
        type: 'DRAW_CARD',
        playerId: cur.id,
        playerName: cur.name,
        message: `${cur.name} drew ${drawn.length} card(s).`,
        timestamp: Date.now(),
      };
      this.onBroadcastEvent('DRAW_CARD', `${cur.name} drew cards.`, 'card_draw');
      this.onStateChange();
      return { success: true, drawnCard: drawn[drawn.length - 1] };
    }

    // Normal draw: draw 1 card
    if (cur.hasDrawnThisTurn) {
      return { success: false, error: 'Already drawn this turn. You can pass if you cannot play.' };
    }

    const drawn = this.drawCards(cur, 1);
    const drawnCard = drawn[0];
    cur.hasDrawnThisTurn = true;

    // If forcePlay is enabled and drawn card is playable, play it automatically
    if (this.settings.forcePlay && drawnCard && isCardPlayable(drawnCard, this.topCard, this.currentColor, 0, this.settings)) {
      if (drawnCard.color !== 'wild') {
        return this.playCard(cur.id, drawnCard.id);
      }
    }

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'DRAW_CARD',
      playerId: cur.id,
      playerName: cur.name,
      message: `${cur.name} drew a card.`,
      timestamp: Date.now(),
    };

    this.onBroadcastEvent('DRAW_CARD', `${cur.name} drew a card.`, 'card_draw');
    this.onStateChange();
    return { success: true, drawnCard };
  }

  public passTurn(playerId: string): { success: boolean; error?: string } {
    if (this.status !== 'playing') {
      return { success: false, error: 'Game not active.' };
    }
    const cur = this.getCurrentPlayer();
    if (!cur || cur.id !== playerId) {
      return { success: false, error: 'Not your turn.' };
    }

    if (this.pendingDrawCount > 0) {
      return { success: false, error: 'Must draw penalty cards before passing.' };
    }

    if (!cur.hasDrawnThisTurn) {
      return { success: false, error: 'Must draw a card before passing.' };
    }

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'PASS',
      playerId: cur.id,
      playerName: cur.name,
      message: `${cur.name} passed their turn.`,
      timestamp: Date.now(),
    };

    this.advanceTurn(1);
    this.onBroadcastEvent('PASS', `${cur.name} passed.`, 'turn_change');
    this.onStateChange();
    return { success: true };
  }

  public callUno(playerId: string): { success: boolean; message: string } {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found.' };

    if (player.hand.length <= 2) {
      player.calledUno = true;
      player.mustCallUno = false;
      this.lastAction = {
        id: `act_${Date.now()}`,
        type: 'UNO_CALLED',
        playerId: player.id,
        playerName: player.name,
        message: `🔥 ${player.name} shouted UNO! 🔥`,
        timestamp: Date.now(),
      };
      this.onBroadcastEvent('UNO_CALLED', `${player.name} yelled UNO!`, 'uno');
      this.onStateChange();
      return { success: true, message: 'UNO declared!' };
    }

    return { success: false, message: 'Can only call UNO with 1 or 2 cards remaining!' };
  }

  public catchUno(callerId: string, targetPlayerId: string): { success: boolean; message: string } {
    const target = this.players.find((p) => p.id === targetPlayerId);
    const caller = this.players.find((p) => p.id === callerId);
    if (!target || !caller) return { success: false, message: 'Player not found.' };

    if (target.hand.length === 1 && target.mustCallUno && !target.calledUno) {
      const penalty = this.settings.unoPenaltyCards || 2;
      this.drawCards(target, penalty);
      target.mustCallUno = false;
      target.calledUno = false;

      this.lastAction = {
        id: `act_${Date.now()}`,
        type: 'CAUGHT_UNO',
        playerId: caller.id,
        playerName: caller.name,
        message: `⚡ ${caller.name} caught ${target.name} forgetting UNO! +${penalty} cards penalty!`,
        timestamp: Date.now(),
      };

      this.onBroadcastEvent('CAUGHT_UNO', `${caller.name} caught ${target.name}! +${penalty} penalty!`, 'caught');
      this.onStateChange();
      return { success: true, message: `Caught ${target.name}! They drew ${penalty} cards.` };
    }

    return { success: false, message: 'Target cannot be caught for UNO.' };
  }

  private handleRoundWin(winner: ServerPlayer): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    this.roundWinnerId = winner.id;
    this.revealedHands = {};

    let roundPoints = 0;
    const active = this.getActivePlayers();
    for (const p of active) {
      this.revealedHands[p.id] = [...p.hand];
      if (p.id !== winner.id) {
        roundPoints += calculateHandScore(p.hand);
      }
    }

    winner.roundScore = roundPoints;
    winner.score += roundPoints;

    this.lastAction = {
      id: `act_${Date.now()}`,
      type: 'ROUND_WON',
      playerId: winner.id,
      playerName: winner.name,
      message: `🏆 ${winner.name} won Round ${this.roundNumber} with +${roundPoints} points!`,
      timestamp: Date.now(),
    };

    if (winner.score >= this.settings.targetScore) {
      this.status = 'game_over';
      this.winnerId = winner.id;
      this.onBroadcastEvent('GAME_OVER', `${winner.name} won the entire game with ${winner.score} points!`, 'win');
    } else {
      this.status = 'round_ended';
      this.onBroadcastEvent('ROUND_WON', `${winner.name} won the round (+${roundPoints} pts)!`, 'win');
    }

    this.onStateChange();
  }

  public resetForNextRound(): void {
    if (this.status !== 'round_ended' && this.status !== 'game_over') return;
    if (this.status === 'game_over') {
      // Reset full scores
      for (const p of this.players) {
        p.score = 0;
        p.roundScore = 0;
      }
      this.roundNumber = 1;
      this.winnerId = null;
    } else {
      this.roundNumber += 1;
    }
    this.startRound();
  }

  public returnToLobby(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.status = 'lobby';
    this.deck = [];
    this.discardPile = [];
    this.topCard = null;
    this.currentColor = null;
    this.roundWinnerId = null;
    this.winnerId = null;
    this.revealedHands = {};
    for (const p of this.players) {
      p.hand = [];
      p.calledUno = false;
      p.mustCallUno = false;
      p.isReady = p.isHost;
    }
    this.onBroadcastEvent('RETURN_TO_LOBBY', 'Returned to lobby.', 'lobby');
    this.onStateChange();
  }

  public addPlayer(player: ServerPlayer): boolean {
    if (this.status !== 'lobby') {
      player.isSpectator = true;
    } else if (this.players.length >= this.settings.maxPlayers) {
      player.isSpectator = true;
    }
    this.players.push(player);
    this.onBroadcastEvent('PLAYER_JOINED', `${player.name} joined the room!`, 'join');
    this.onStateChange();
    return true;
  }

  public removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    const [removed] = this.players.splice(idx, 1);
    this.onBroadcastEvent('PLAYER_LEFT', `${removed.name} left the room.`, 'leave');

    // Host migration
    if (removed.isHost && this.players.length > 0) {
      const nextHost = this.players.find((p) => p.isConnected) || this.players[0];
      nextHost.isHost = true;
      this.hostId = nextHost.id;
      this.onBroadcastEvent('HOST_CHANGED', `${nextHost.name} is now the host.`, 'host');
    }

    // Active player adjustments if during game
    if (this.status === 'playing') {
      const active = this.getActivePlayers();
      if (active.length < 2) {
        // Not enough players to continue
        this.status = 'lobby';
        this.onBroadcastEvent('GAME_ABORTED', 'Not enough players to continue. Returned to lobby.', 'error');
      } else {
        if (this.currentTurnIndex >= active.length) {
          this.currentTurnIndex = 0;
        }
        this.resetTurnTimer();
      }
    }

    this.onStateChange();
  }

  public getPublicGameState(): PublicGameState {
    const cur = this.getCurrentPlayer();
    return {
      roomId: this.roomId,
      hostId: this.hostId,
      status: this.status,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        cardCount: p.hand.length,
        score: p.score,
        roundScore: p.roundScore,
        isConnected: p.isConnected,
        isReady: p.isReady,
        isHost: p.isHost,
        isSpectator: p.isSpectator,
        calledUno: p.calledUno,
        mustCallUno: p.mustCallUno,
        lastActionText: p.lastActionText,
      })),
      topCard: this.topCard,
      currentColor: this.currentColor,
      currentTurnPlayerId: cur ? cur.id : null,
      direction: this.direction,
      pendingDrawCount: this.pendingDrawCount,
      pendingColorChoice: this.pendingColorChoice,
      pendingColorPlayerId: this.pendingColorPlayerId,
      roundNumber: this.roundNumber,
      winnerId: this.winnerId,
      roundWinnerId: this.roundWinnerId,
      turnExpiresAt: this.turnExpiresAt,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      lastAction: this.lastAction,
      revealedHands: this.status === 'round_ended' || this.status === 'game_over' ? this.revealedHands : undefined,
    };
  }

  public getClientSyncState(playerId: string): ClientSyncState {
    const player = this.players.find((p) => p.id === playerId);
    const cur = this.getCurrentPlayer();
    const isTurn = cur?.id === playerId;

    const myHand = player ? player.hand : [];
    const playableCardIds: string[] = [];

    if (isTurn && this.status === 'playing') {
      for (const card of myHand) {
        if (isCardPlayable(card, this.topCard, this.currentColor, this.pendingDrawCount, this.settings)) {
          playableCardIds.push(card.id);
        }
      }
    } else if (this.settings.jumpIn && this.status === 'playing' && this.topCard) {
      // Check for jump-in matches
      for (const card of myHand) {
        if (card.value === this.topCard.value && card.color === this.currentColor) {
          playableCardIds.push(card.id);
        }
      }
    }

    // Can draw if it is their turn and not waiting for color choice
    const canDraw = Boolean(isTurn && this.status === 'playing' && !this.pendingColorChoice && (this.pendingDrawCount > 0 || !cur?.hasDrawnThisTurn || this.settings.drawUntilPlayable));
    const canPass = Boolean(isTurn && this.status === 'playing' && !this.pendingColorChoice && this.pendingDrawCount === 0 && cur?.hasDrawnThisTurn);
    const canCallUno = Boolean(player && player.hand.length <= 2 && !player.calledUno);

    // Can catch an opponent who forgot UNO
    const catchTarget = this.players.find((p) => p.id !== playerId && p.hand.length === 1 && p.mustCallUno && !p.calledUno);

    return {
      gameState: this.getPublicGameState(),
      myHand,
      myPlayerId: playerId,
      canDraw,
      canPass,
      canCallUno,
      canCatchUnoTargetId: catchTarget ? catchTarget.id : null,
      playableCardIds,
    };
  }

  public destroy(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }
}
