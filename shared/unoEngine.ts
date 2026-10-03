import { Card, CardColor, CardValue, PlayableColor, GameRules } from './types.js';

export function createUnoDeck(): Card[] {
  const deck: Card[] = [];
  const colors: PlayableColor[] = ['red', 'blue', 'green', 'yellow'];

  let idCounter = 1;

  for (const color of colors) {
    // One 0 card per color
    deck.push({
      id: `c_${idCounter++}_${color}_0`,
      color,
      value: '0',
      scoreValue: 0,
    });

    // Two of each 1-9
    for (let num = 1; num <= 9; num++) {
      const valStr = num.toString() as CardValue;
      deck.push({
        id: `c_${idCounter++}_${color}_${valStr}_a`,
        color,
        value: valStr,
        scoreValue: num,
      });
      deck.push({
        id: `c_${idCounter++}_${color}_${valStr}_b`,
        color,
        value: valStr,
        scoreValue: num,
      });
    }

    // Two of each action card (skip, reverse, draw2)
    const actions: CardValue[] = ['skip', 'reverse', 'draw2'];
    for (const action of actions) {
      deck.push({
        id: `c_${idCounter++}_${color}_${action}_a`,
        color,
        value: action,
        scoreValue: 20,
      });
      deck.push({
        id: `c_${idCounter++}_${color}_${action}_b`,
        color,
        value: action,
        scoreValue: 20,
      });
    }
  }

  // 4 Wild cards
  for (let i = 1; i <= 4; i++) {
    deck.push({
      id: `c_${idCounter++}_wild_${i}`,
      color: 'wild',
      value: 'wild',
      scoreValue: 50,
    });
  }

  // 4 Wild Draw 4 cards
  for (let i = 1; i <= 4; i++) {
    deck.push({
      id: `c_${idCounter++}_wild_draw4_${i}`,
      color: 'wild',
      value: 'wild_draw4',
      scoreValue: 50,
    });
  }

  return shuffleDeck(deck);
}

export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function isCardPlayable(
  card: Card,
  topCard: Card | null,
  currentColor: PlayableColor | null,
  pendingDrawCount: number,
  rules: GameRules
): boolean {
  if (!topCard || !currentColor) return true;

  // If there is an active stacking draw penalty
  if (pendingDrawCount > 0) {
    if (!rules.stackingDraw) return false;
    // When stacked, player can stack:
    // If topCard is draw2, can play another draw2 (or wild_draw4 if stacking allows)
    if (topCard.value === 'draw2') {
      return card.value === 'draw2' || card.value === 'wild_draw4';
    }
    // If topCard is wild_draw4, can stack another wild_draw4
    if (topCard.value === 'wild_draw4') {
      return card.value === 'wild_draw4';
    }
    return false;
  }

  // Wild cards can always be played
  if (card.color === 'wild') {
    return true;
  }

  // Color match
  if (card.color === currentColor) {
    return true;
  }

  // Value match
  if (card.value === topCard.value) {
    return true;
  }

  return false;
}

export function calculateHandScore(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + card.scoreValue, 0);
}
