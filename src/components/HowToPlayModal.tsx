import React from 'react';
import { X, BookOpen, AlertCircle, ShieldCheck, Zap } from 'lucide-react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-400" />
            <h3 className="text-xl font-black text-white font-['Outfit']">How to Play UNO</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto pr-2 py-4 space-y-4 text-sm text-slate-300">
          <section className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700">
            <h4 className="font-bold text-amber-400 mb-1 flex items-center gap-1.5 font-['Fredoka']">
              <Zap className="w-4 h-4" /> Objective
            </h4>
            <p className="text-xs leading-relaxed">
              Be the first player to get rid of all your cards. You score points based on the cards left in your opponents' hands!
            </p>
          </section>

          <section className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700">
            <h4 className="font-bold text-amber-400 mb-2 font-['Fredoka']">Matching Cards</h4>
            <p className="text-xs leading-relaxed mb-2">
              On your turn, play a card from your hand that matches the discard pile's:
            </p>
            <ul className="text-xs space-y-1 list-disc list-inside text-slate-300 pl-1">
              <li><strong className="text-white">Color:</strong> Red, Blue, Green, or Yellow</li>
              <li><strong className="text-white">Number or Symbol:</strong> 0–9, Skip, Reverse, Draw 2</li>
              <li><strong className="text-white">Wild Cards:</strong> Can be played anytime on your turn!</li>
            </ul>
          </section>

          <section className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700">
            <h4 className="font-bold text-amber-400 mb-2 font-['Fredoka']">Special Action Cards</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-red-400">Skip:</span> Next player loses their turn. In 2-player games, you go again!
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-sky-400">Reverse:</span> Reverses play direction. In 2-player games, acts as Skip.
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-emerald-400">Draw Two (+2):</span> Next player draws 2 cards (or stacks another +2 if stacking rule is enabled!).
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-bold text-amber-400">Wild:</span> Choose any of the 4 colors for the table.
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-purple-500/40 col-span-1 sm:col-span-2">
                <span className="font-bold text-purple-400">Wild Draw Four (+4):</span> Choose the new color AND next player draws 4 cards (or stacks!).
              </div>
            </div>
          </section>

          <section className="bg-amber-950/40 p-3.5 rounded-2xl border border-amber-500/40">
            <h4 className="font-bold text-amber-400 mb-1 flex items-center gap-1.5 font-['Fredoka']">
              <AlertCircle className="w-4 h-4 text-amber-400" /> Don't Forget UNO!
            </h4>
            <p className="text-xs leading-relaxed text-amber-200">
              When you have 1 card left, you MUST press the <strong className="text-white underline">UNO</strong> button! If another player catches you before you call it, you must draw a penalty of 2 cards!
            </p>
          </section>
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl shadow-lg transition cursor-pointer font-['Outfit']"
        >
          Got It, Let's Play!
        </button>
      </div>
    </div>
  );
};
