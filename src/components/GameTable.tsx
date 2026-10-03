import React, { useState, useEffect } from 'react';
import {
  ClientSyncState,
  Card,
  PlayableColor,
} from '../../shared/types';
import { UnoCard } from './UnoCard';
import { CardSlider } from './CardSlider';
import {
  Settings as SettingsIcon,
  Flame,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Zap,
  Hand,
  FastForward,
} from 'lucide-react';
import { soundManager } from '../utils/audio';

interface GameTableProps {
  syncState: ClientSyncState;
  onPlayCard: (cardId: string, chosenColor?: PlayableColor) => void;
  onDrawCard: (drawAll?: boolean) => void;
  onPassTurn: () => void;
  onCallUno: () => void;
  onCatchUno: (targetPlayerId: string) => void;
  onOpenSettings: () => void;
  onRequestColorPick: (card: Card) => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  syncState,
  onPlayCard,
  onDrawCard,
  onPassTurn,
  onCallUno,
  onCatchUno,
  onOpenSettings,
  onRequestColorPick,
}) => {
  const { gameState, myHand, myPlayerId, canDraw, canPass, canCallUno, canCatchUnoTargetId, playableCardIds } = syncState;
  const [sortedBy, setSortedBy] = useState<'default' | 'color' | 'value'>('default');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Flying Card Animation State
  const [flyingCard, setFlyingCard] = useState<{
    card?: Card;
    type: 'play' | 'draw';
    id: string;
  } | null>(null);

  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;
  const opponents = gameState.players.filter((p) => p.id !== myPlayerId);
  const isPenaltyActive = isMyTurn && gameState.pendingDrawCount > 0;

  // Turn timer countdown
  useEffect(() => {
    if (!gameState.turnExpiresAt) {
      setTimeLeft(null);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((gameState.turnExpiresAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [gameState.turnExpiresAt]);

  // Card sorting
  const getSortedCards = (): Card[] => {
    const list = [...myHand];
    if (sortedBy === 'color') {
      const order: Record<string, number> = { red: 1, blue: 2, green: 3, yellow: 4, wild: 5 };
      return list.sort((a, b) => (order[a.color] || 99) - (order[b.color] || 99));
    }
    if (sortedBy === 'value') {
      return list.sort((a, b) => a.value.localeCompare(b.value));
    }
    return list;
  };

  const handleCardPlay = (card: Card) => {
    // Trigger flying card animation
    setFlyingCard({ card, type: 'play', id: `play_${Date.now()}` });
    setTimeout(() => setFlyingCard(null), 400);

    if (card.color === 'wild') {
      onRequestColorPick(card);
    } else {
      onPlayCard(card.id);
    }
  };

  const handleDrawCardClick = (drawAll = false) => {
    soundManager.playCardDraw();
    setFlyingCard({ type: 'draw', id: `draw_${Date.now()}` });
    setTimeout(() => setFlyingCard(null), 400);
    onDrawCard(drawAll);
  };

  const currentColorStyle: Record<PlayableColor, { text: string; bg: string; border: string; glow: string }> = {
    red: { text: 'text-red-400', bg: 'bg-red-500', border: 'border-red-400', glow: 'shadow-red-500/60' },
    blue: { text: 'text-sky-400', bg: 'bg-blue-500', border: 'border-sky-400', glow: 'shadow-blue-500/60' },
    green: { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-400', glow: 'shadow-emerald-500/60' },
    yellow: { text: 'text-amber-400', bg: 'bg-amber-400', border: 'border-amber-300', glow: 'shadow-amber-400/60' },
  };

  const activeColorObj = gameState.currentColor ? currentColorStyle[gameState.currentColor] : null;

  return (
    <div className="relative w-full h-screen max-h-screen overflow-hidden flex flex-col justify-between bg-slate-950 select-none">
      {/* Dynamic Flying Card Overlay Animation */}
      {flyingCard && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          {flyingCard.type === 'play' && flyingCard.card && (
            <div className="animate-fly-to-discard">
              <UnoCard card={flyingCard.card} size="lg" className="shadow-2xl shadow-black/80" />
            </div>
          )}
          {flyingCard.type === 'draw' && (
            <div className="animate-fly-from-deck">
              <UnoCard isBack size="lg" className="shadow-2xl shadow-black/80" />
            </div>
          )}
        </div>
      )}

      {/* Top Header / Status bar */}
      <header className="z-30 px-3 py-2 sm:px-6 sm:py-3 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="font-['Fredoka'] font-black text-xl sm:text-2xl tracking-tight text-white flex items-center">
            <span className="text-red-500 drop-shadow-[0_2px_4px_rgba(239,68,68,0.5)]">U</span>
            <span className="text-amber-400 drop-shadow-[0_2px_4px_rgba(251,191,36,0.5)]">N</span>
            <span className="text-emerald-400 drop-shadow-[0_2px_4px_rgba(52,211,153,0.5)]">O</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-xs text-slate-300 font-mono">
            <span>ROOM:</span>
            <span className="text-amber-400 font-black tracking-wider">{gameState.roomId}</span>
          </div>

          <div className="px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-xs text-slate-300 font-medium">
            Round {gameState.roundNumber}
          </div>
        </div>

        {/* Current status pill */}
        <div className="flex items-center gap-2">
          {isMyTurn ? (
            <div className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-black text-xs sm:text-sm animate-pulse shadow-lg shadow-amber-400/40 flex items-center gap-1.5 font-['Outfit'] border border-amber-200">
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>YOUR TURN!</span>
              {timeLeft !== null && <span className="font-mono text-xs">({timeLeft}s)</span>}
            </div>
          ) : (
            <div className="px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>
                {gameState.players.find((p) => p.id === gameState.currentTurnPlayerId)?.name || 'Someone'}&apos;s Turn
              </span>
              {timeLeft !== null && <span className="font-mono text-slate-400 text-[11px]">({timeLeft}s)</span>}
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700 shadow-sm"
            title="Settings & Rules"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Table Arena */}
      <main className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        {/* Felt Table Surface with Authentic Vignette */}
        <div
          className="relative w-full max-w-5xl h-[96%] rounded-[40px] sm:rounded-[60px] border-4 border-amber-950/90 shadow-[inset_0_0_100px_rgba(0,0,0,0.9),0_20px_45px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between p-3 sm:p-6 overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, #064e3b 0%, #022c22 65%, #01140e 100%)',
          }}
        >
          {/* Subtle felt lighting shimmer */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-black/40 pointer-events-none" />

          {/* Direction Indicator Flow with glowing arrows */}
          <div className="absolute inset-x-8 sm:inset-x-14 inset-y-10 sm:inset-y-14 rounded-[50px] border border-white/5 pointer-events-none flex items-center justify-between px-6 opacity-35">
            {gameState.direction === 1 ? (
              <>
                <ArrowRight className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                <ArrowRight className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse rotate-90 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                <ArrowLeft className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              </>
            ) : (
              <>
                <ArrowLeft className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                <ArrowLeft className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse -rotate-90 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                <ArrowRight className="w-7 h-7 sm:w-10 sm:h-10 text-amber-300 animate-pulse drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              </>
            )}
          </div>

          {/* Opponents Section (Top & Sides) */}
          <div className="w-full flex items-start justify-around gap-2 z-10 flex-wrap">
            {opponents.map((p) => {
              const isPlayerTurn = gameState.currentTurnPlayerId === p.id;
              const canCatchThis = canCatchUnoTargetId === p.id;

              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col items-center p-2 rounded-2xl transition-all duration-300 ${
                    isPlayerTurn
                      ? 'bg-amber-950/90 border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)] scale-105'
                      : 'bg-slate-900/80 border border-slate-800 shadow-md'
                  }`}
                >
                  {/* Avatar and name */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xl sm:text-2xl drop-shadow">{p.avatar}</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white max-w-[80px] sm:max-w-[110px] truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-400">Score: {p.score}</div>
                    </div>
                  </div>

                  {/* Opponent card fan count */}
                  <div className="flex items-center justify-center my-0.5">
                    <div className="relative flex items-center justify-center">
                      <UnoCard isBack size="xs" />
                      <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-black text-[10px] px-1.5 py-0.5 rounded-full shadow-md border border-slate-900">
                        {p.cardCount}
                      </span>
                    </div>
                  </div>

                  {/* UNO Status or Catch button */}
                  {p.calledUno && (
                    <span className="mt-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-red-700 text-white font-black text-[10px] animate-bounce shadow-lg border border-red-300">
                      🔥 UNO!
                    </span>
                  )}

                  {canCatchThis && (
                    <button
                      onClick={() => onCatchUno(p.id)}
                      className="mt-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-red-600 hover:scale-105 active:scale-95 text-slate-950 font-black text-[10px] shadow-lg animate-pulse cursor-pointer border border-amber-200"
                    >
                      🚨 CATCH UNO!
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Table Center (Draw Pile & Discard Pile Arena) */}
          <div className="relative my-auto flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-14 z-10">
            {/* Draw Pile Deck (Interactive for normal draws and penalty taking) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => {
                  if (isPenaltyActive) {
                    handleDrawCardClick(false); // Draw 1 card on own!
                  } else if (canDraw) {
                    handleDrawCardClick(false);
                  }
                }}
                className={`relative group ${
                  canDraw || isPenaltyActive ? 'cursor-pointer hover:scale-105 active:scale-95' : 'opacity-85'
                } transition-transform duration-200`}
              >
                {/* 3D Stack depth layers */}
                <div className="absolute inset-0 bg-slate-900 rounded-2xl translate-x-2 translate-y-2 shadow-lg" />
                <div className="absolute inset-0 bg-slate-800 rounded-2xl translate-x-1 translate-y-1 shadow-md" />

                {/* Draw Deck Card */}
                <UnoCard isBack size="lg" className="shadow-2xl" />

                {/* PENALTY ACTIVE BEACON: "TAP DECK TO DRAW (+N Left)" */}
                {isPenaltyActive && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-slate-950 font-black text-xs px-3 py-1 rounded-full shadow-2xl border-2 border-amber-300 animate-bounce flex items-center gap-1 z-30 font-['Outfit']">
                    <Hand className="w-3.5 h-3.5 fill-slate-950" />
                    <span>TAP TO TAKE (+{gameState.pendingDrawCount} left)</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-bold text-emerald-200/90 font-['Outfit']">
                  Draw Deck ({gameState.deckCount})
                </span>

                {/* Quick button to take all penalty cards at once if desired */}
                {isPenaltyActive && gameState.pendingDrawCount > 1 && (
                  <button
                    onClick={() => handleDrawCardClick(true)}
                    className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                    title="Take all remaining penalty cards at once"
                  >
                    <FastForward className="w-3 h-3" />
                    Take All ({gameState.pendingDrawCount})
                  </button>
                )}
              </div>
            </div>

            {/* Active Color & Discard Center Arena */}
            <div className="flex flex-col items-center">
              <div className="relative">
                {/* Ambient glow spotlight matching active color */}
                {activeColorObj && (
                  <div
                    className={`absolute -inset-6 rounded-full ${activeColorObj.bg} blur-2xl opacity-45 animate-pulse pointer-events-none`}
                  />
                )}

                {gameState.topCard ? (
                  <UnoCard card={gameState.topCard} size="lg" className="rotate-2 shadow-2xl" />
                ) : (
                  <div className="w-28 h-42 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center text-xs text-white/50">
                    Empty
                  </div>
                )}
              </div>

              {/* Current Active Color badge */}
              {activeColorObj && (
                <div
                  className={`mt-2.5 px-3.5 py-1 rounded-full ${activeColorObj.bg} text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl flex items-center gap-1 font-['Fredoka'] border border-white/40`}
                >
                  <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                  Color: {gameState.currentColor}
                </div>
              )}
            </div>
          </div>

          {/* Action announcement toast / log */}
          {gameState.lastAction && (
            <div className="z-10 py-1.5 px-4 rounded-full bg-slate-950/85 border border-slate-700/80 text-[11px] sm:text-xs text-slate-200 text-center max-w-lg truncate backdrop-blur-md shadow-lg">
              {gameState.lastAction.message}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Area: Slide to Choose Hand Cards & Player Action Buttons */}
      <footer className="z-30 w-full bg-slate-900/95 border-t border-slate-800 p-2 sm:p-3 backdrop-blur-xl flex flex-col items-center shadow-2xl">
        {/* Actions bar above hand */}
        <div className="w-full max-w-4xl flex items-center justify-between mb-1 px-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-['Outfit'] text-sm">
              Your Hand ({myHand.length})
            </span>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <button
                onClick={() => {
                  soundManager.playClick();
                  setSortedBy(sortedBy === 'color' ? 'default' : 'color');
                }}
                className={`px-2.5 py-0.5 rounded-lg border cursor-pointer transition ${
                  sortedBy === 'color'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                Sort Color
              </button>
              <button
                onClick={() => {
                  soundManager.playClick();
                  setSortedBy(sortedBy === 'value' ? 'default' : 'value');
                }}
                className={`px-2.5 py-0.5 rounded-lg border cursor-pointer transition ${
                  sortedBy === 'value'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                Sort Value
              </button>
            </div>
          </div>

          {/* Action Buttons (Draw / Pass / BIG UNO) */}
          <div className="flex items-center gap-2">
            {canDraw && !isPenaltyActive && (
              <button
                onClick={() => handleDrawCardClick(false)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center gap-1 text-xs border border-emerald-400/40"
              >
                <span>Draw Card</span>
              </button>
            )}

            {canPass && !isPenaltyActive && (
              <button
                onClick={onPassTurn}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 transition cursor-pointer text-xs"
              >
                Pass Turn
              </button>
            )}

            {/* BIG UNO BUTTON */}
            {canCallUno && (
              <button
                onClick={onCallUno}
                className="px-4 py-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-red-500/30 animate-bounce cursor-pointer flex items-center gap-1 font-['Fredoka'] border border-amber-200"
              >
                <Flame className="w-4 h-4 fill-slate-950" />
                UNO!
              </button>
            )}
          </div>
        </div>

        {/* Hand Cards Carousel with Slide-to-Choose gesture and fanning */}
        <div className="w-full max-w-5xl">
          <CardSlider
            cards={getSortedCards()}
            playableCardIds={playableCardIds}
            isMyTurn={isMyTurn}
            onCardPlay={handleCardPlay}
          />
        </div>
      </footer>
    </div>
  );
};
