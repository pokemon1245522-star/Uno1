import React, { useEffect } from 'react';
import { PublicGameState, Card } from '../../shared/types';
import { UnoCard } from './UnoCard';
import confetti from 'canvas-confetti';
import { Trophy, Award, RotateCcw, Home, Crown, CheckCircle } from 'lucide-react';

interface ResultsModalProps {
  gameState: PublicGameState;
  myPlayerId: string;
  isHost: boolean;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  gameState,
  myPlayerId,
  isHost,
  onPlayAgain,
  onReturnToLobby,
  onLeaveRoom,
}) => {
  const isGameOver = gameState.status === 'game_over';
  const winner = isGameOver
    ? gameState.players.find((p) => p.id === gameState.winnerId)
    : gameState.players.find((p) => p.id === gameState.roundWinnerId);

  const isMeWinner = winner?.id === myPlayerId;

  useEffect(() => {
    try {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // Ignore if canvas-confetti fails
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border-2 border-amber-400/80 rounded-3xl p-6 sm:p-8 max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-amber-500/20 to-transparent pointer-events-none" />

        <div className="text-center mb-5 relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 mb-3 shadow-lg shadow-amber-500/40">
            <Trophy className="w-9 h-9" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit'] tracking-wide">
            {isGameOver ? '🏆 MATCH CHAMPION!' : `🎉 ROUND ${gameState.roundNumber} WINNER!`}
          </h2>
          <p className="text-sm font-semibold text-amber-300 mt-1">
            {winner ? `${winner.avatar} ${winner.name}` : 'Winner'} {isMeWinner ? '(YOU!)' : ''} took the win!
          </p>
        </div>

        {/* Player scores & cards reveal */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-['Outfit']">
            Round Summary & Hand Reveal
          </h4>

          {gameState.players.map((p) => {
            const isRoundWinner = p.id === gameState.roundWinnerId;
            const revealed = gameState.revealedHands ? gameState.revealedHands[p.id] || [] : [];

            return (
              <div
                key={p.id}
                className={`p-3 rounded-2xl border transition-all ${
                  isRoundWinner
                    ? 'bg-amber-950/40 border-amber-500/60 shadow-md shadow-amber-500/10'
                    : 'bg-slate-800/60 border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.avatar}</span>
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      {p.name}
                      {p.id === myPlayerId && <span className="text-[10px] text-sky-400 font-normal">(You)</span>}
                      {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-amber-300 block">
                      {isRoundWinner ? `+${p.roundScore} pts` : `0 pts`}
                    </span>
                    <span className="text-[11px] text-slate-400">Total: {p.score} pts</span>
                  </div>
                </div>

                {/* Show remaining cards */}
                {revealed.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-700/50">
                    {revealed.map((card) => (
                      <UnoCard key={card.id} card={card} size="xs" />
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-400 font-medium">No cards left! Cleared hand!</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row gap-2.5">
          {isHost ? (
            <button
              onClick={onPlayAgain}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-2xl shadow-xl shadow-amber-500/25 transition cursor-pointer flex items-center justify-center gap-2 font-['Outfit'] text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              {isGameOver ? 'Play New Game' : 'Next Round'}
            </button>
          ) : (
            <div className="flex-1 text-center py-2.5 text-xs text-slate-400 italic">
              Waiting for host to start next round...
            </div>
          )}

          <button
            onClick={onLeaveRoom}
            className="py-3 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-2xl transition cursor-pointer flex items-center justify-center gap-2 text-xs"
          >
            <Home className="w-4 h-4" />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};
