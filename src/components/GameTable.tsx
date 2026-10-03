import React, { useState, useEffect } from 'react';
import {
  PublicGameState,
  ClientSyncState,
  Card,
  PlayableColor,
  PublicPlayer,
} from '../../shared/types';
import { UnoCard } from './UnoCard';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Settings as SettingsIcon,
  Flame,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Crown,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { soundManager } from '../utils/audio';

interface GameTableProps {
  syncState: ClientSyncState;
  onPlayCard: (cardId: string, chosenColor?: PlayableColor) => void;
  onDrawCard: () => void;
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

  const me = gameState.players.find((p) => p.id === myPlayerId);
  const isMyTurn = gameState.currentTurnPlayerId === myPlayerId;
  const opponents = gameState.players.filter((p) => p.id !== myPlayerId);

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

  const handleCardClick = (card: Card) => {
    soundManager.playClick();
    if (card.color === 'wild') {
      onRequestColorPick(card);
    } else {
      onPlayCard(card.id);
    }
  };

  const currentColorStyle: Record<PlayableColor, { text: string; bg: string; border: string; glow: string }> = {
    red: { text: 'text-red-400', bg: 'bg-red-500', border: 'border-red-400', glow: 'shadow-red-500/50' },
    blue: { text: 'text-sky-400', bg: 'bg-blue-500', border: 'border-sky-400', glow: 'shadow-blue-500/50' },
    green: { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-400', glow: 'shadow-emerald-500/50' },
    yellow: { text: 'text-amber-400', bg: 'bg-amber-400', border: 'border-amber-300', glow: 'shadow-amber-400/50' },
  };

  const activeColorObj = gameState.currentColor ? currentColorStyle[gameState.currentColor] : null;

  return (
    <div className="relative w-full h-screen max-h-screen overflow-hidden flex flex-col justify-between bg-slate-950">
      {/* Top Header / Status bar */}
      <header className="z-30 px-3 py-2 sm:px-6 sm:py-3 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-['Fredoka'] font-black text-lg sm:text-xl tracking-tight text-white flex items-center">
            <span className="text-red-500">U</span>
            <span className="text-amber-400">N</span>
            <span className="text-emerald-400">O</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-xs text-slate-300 font-mono">
            <span>ROOM:</span>
            <span className="text-amber-400 font-bold">{gameState.roomId}</span>
          </div>

          <div className="px-2.5 py-1 rounded-full bg-slate-800 text-xs text-slate-300 font-medium">
            Round {gameState.roundNumber}
          </div>
        </div>

        {/* Current status pill */}
        <div className="flex items-center gap-2">
          {isMyTurn ? (
            <div className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs sm:text-sm animate-pulse shadow-lg shadow-amber-500/30 flex items-center gap-1.5 font-['Outfit']">
              <Zap className="w-3.5 h-3.5 fill-slate-950" /> YOUR TURN!
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
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Settings & Audio"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Table Arena */}
      <main className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        {/* Felt Table Surface */}
        <div
          className="relative w-full max-w-5xl h-[95%] rounded-[40px] sm:rounded-[60px] border-4 border-amber-950/80 shadow-[inset_0_0_80px_rgba(0,0,0,0.85),0_15px_35px_rgba(0,0,0,0.7)] flex flex-col items-center justify-between p-3 sm:p-6 overflow-hidden"
          style={{
            background: 'radial-gradient(ellipse at center, #064e3b 0%, #022c22 75%, #021a14 100%)',
          }}
        >
          {/* Subtle felt texture shine */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/30 pointer-events-none" />

          {/* Direction Indicator Flow */}
          <div className="absolute inset-x-12 inset-y-12 rounded-[50px] border border-white/5 pointer-events-none flex items-center justify-between px-6 opacity-30">
            {gameState.direction === 1 ? (
              <>
                <ArrowRight className="w-8 h-8 text-amber-300 animate-pulse" />
                <ArrowRight className="w-8 h-8 text-amber-300 animate-pulse rotate-90" />
                <ArrowLeft className="w-8 h-8 text-amber-300 animate-pulse" />
              </>
            ) : (
              <>
                <ArrowLeft className="w-8 h-8 text-amber-300 animate-pulse" />
                <ArrowLeft className="w-8 h-8 text-amber-300 animate-pulse -rotate-90" />
                <ArrowRight className="w-8 h-8 text-amber-300 animate-pulse" />
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
                  className={`relative flex flex-col items-center p-1.5 sm:p-2 rounded-2xl transition-all duration-300 ${
                    isPlayerTurn
                      ? 'bg-amber-950/80 border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] scale-105'
                      : 'bg-slate-900/70 border border-slate-800'
                  }`}
                >
                  {/* Avatar and name */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xl sm:text-2xl">{p.avatar}</span>
                    <div className="text-left">
                      <div className="text-xs font-bold text-white max-w-[80px] sm:max-w-[100px] truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-400">Score: {p.score}</div>
                    </div>
                  </div>

                  {/* Opponent card fan count */}
                  <div className="flex items-center justify-center my-0.5">
                    <div className="relative flex items-center justify-center">
                      <UnoCard isBack size="xs" />
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.2 rounded-full shadow">
                        {p.cardCount}
                      </span>
                    </div>
                  </div>

                  {/* UNO Status or Catch button */}
                  {p.calledUno && (
                    <span className="mt-1 px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[10px] animate-bounce shadow">
                      UNO!
                    </span>
                  )}

                  {canCatchThis && (
                    <button
                      onClick={() => onCatchUno(p.id)}
                      className="mt-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-amber-500 hover:scale-105 active:scale-95 text-white font-black text-[10px] shadow-lg animate-pulse cursor-pointer"
                    >
                      CATCH UNO! 🚨
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Table Center (Draw Pile & Discard Pile) */}
          <div className="relative my-auto flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 z-10">
            {/* Draw Pile Deck */}
            <div className="flex flex-col items-center">
              <div
                onClick={canDraw ? onDrawCard : undefined}
                className={`relative group ${canDraw ? 'cursor-pointer' : 'opacity-80'}`}
              >
                {/* Visual stack depth */}
                <div className="absolute inset-0 bg-slate-900 rounded-xl translate-x-1.5 translate-y-1.5 shadow-md" />
                <div className="absolute inset-0 bg-slate-800 rounded-xl translate-x-1 translate-y-1 shadow-md" />
                <UnoCard isBack size="lg" className={canDraw ? 'hover:scale-105 transition-transform' : ''} />
              </div>
              <span className="mt-2 text-xs font-semibold text-emerald-200/90 font-['Outfit']">
                Draw Deck ({gameState.deckCount})
              </span>
            </div>

            {/* Active Color & Discard Center Arena */}
            <div className="flex flex-col items-center">
              <div className="relative">
                {/* Ambient glow matching active color */}
                {activeColorObj && (
                  <div
                    className={`absolute -inset-4 rounded-full ${activeColorObj.bg} blur-xl opacity-40 animate-pulse pointer-events-none`}
                  />
                )}

                {gameState.topCard ? (
                  <UnoCard card={gameState.topCard} size="lg" className="rotate-2" />
                ) : (
                  <div className="w-24 h-36 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center text-xs text-white/50">
                    Empty
                  </div>
                )}
              </div>

              {/* Current Active Color badge */}
              {activeColorObj && (
                <div
                  className={`mt-2 px-3 py-1 rounded-full ${activeColorObj.bg} text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-1 font-['Fredoka']`}
                >
                  <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                  Color: {gameState.currentColor}
                </div>
              )}
            </div>

            {/* Stacking draw penalty banner */}
            {gameState.pendingDrawCount > 0 && (
              <div className="sm:absolute -bottom-8 px-4 py-1.5 bg-red-600/90 border-2 border-amber-300 text-white font-black text-xs sm:text-sm rounded-full shadow-2xl animate-bounce">
                ⚠️ +{gameState.pendingDrawCount} Draw Stack Active!
              </div>
            )}
          </div>

          {/* Action announcement toast / log */}
          {gameState.lastAction && (
            <div className="z-10 py-1 px-4 rounded-full bg-slate-950/80 border border-slate-700 text-[11px] text-slate-300 text-center max-w-md truncate backdrop-blur-sm">
              {gameState.lastAction.message}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Area: Controls & Player Hand */}
      <footer className="z-30 w-full bg-slate-900/95 border-t border-slate-800 p-2 sm:p-4 backdrop-blur-xl flex flex-col items-center">
        {/* Actions bar above hand */}
        <div className="w-full max-w-4xl flex items-center justify-between mb-2 px-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-['Outfit']">Your Hand ({myHand.length})</span>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <button
                onClick={() => setSortedBy(sortedBy === 'color' ? 'default' : 'color')}
                className={`px-2 py-0.5 rounded-lg border cursor-pointer transition ${
                  sortedBy === 'color' ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-slate-800 border-slate-700'
                }`}
              >
                Sort Color
              </button>
              <button
                onClick={() => setSortedBy(sortedBy === 'value' ? 'default' : 'value')}
                className={`px-2 py-0.5 rounded-lg border cursor-pointer transition ${
                  sortedBy === 'value' ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-slate-800 border-slate-700'
                }`}
              >
                Sort Value
              </button>
            </div>
          </div>

          {/* Hand Action Buttons (Draw / Pass / UNO) */}
          <div className="flex items-center gap-2">
            {canDraw && (
              <button
                onClick={() => {
                  soundManager.playCardDraw();
                  onDrawCard();
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center gap-1 text-xs"
              >
                <Layers className="w-3.5 h-3.5" />
                Draw Card
              </button>
            )}

            {canPass && (
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
                className="px-4 py-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-red-500/30 animate-bounce cursor-pointer flex items-center gap-1 font-['Fredoka']"
              >
                <Flame className="w-4 h-4 fill-slate-950" />
                UNO!
              </button>
            )}
          </div>
        </div>

        {/* Hand Cards Carousel / Horizontal Scroll */}
        <div className="w-full max-w-5xl overflow-x-auto pb-2 pt-1 px-4 flex items-center justify-center min-h-[110px] sm:min-h-[140px] no-scrollbar">
          <div className="flex items-center -space-x-4 sm:-space-x-6 hover:space-x-1 transition-all duration-300 py-2">
            {getSortedCards().map((card) => {
              const isPlayable = playableCardIds.includes(card.id);
              return (
                <div key={card.id} className="transition-transform duration-200">
                  <UnoCard
                    card={card}
                    size="md"
                    isPlayable={isPlayable}
                    onClick={() => handleCardClick(card)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
};
