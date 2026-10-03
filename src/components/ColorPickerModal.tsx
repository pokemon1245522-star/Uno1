import React from 'react';
import { PlayableColor } from '../../shared/types';
import { motion, AnimatePresence } from 'motion/react';

interface ColorPickerModalProps {
  isOpen: boolean;
  onSelectColor: (color: PlayableColor) => void;
}

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ isOpen, onSelectColor }) => {
  if (!isOpen) return null;

  const colors: { id: PlayableColor; name: string; bg: string; border: string; glow: string }[] = [
    { id: 'red', name: 'Red', bg: 'bg-red-500 hover:bg-red-400 active:bg-red-600', border: 'border-red-300', glow: 'shadow-red-500/50' },
    { id: 'blue', name: 'Blue', bg: 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600', border: 'border-blue-300', glow: 'shadow-blue-500/50' },
    { id: 'yellow', name: 'Yellow', bg: 'bg-amber-400 hover:bg-amber-300 active:bg-amber-500', border: 'border-yellow-200', glow: 'shadow-amber-400/50' },
    { id: 'green', name: 'Green', bg: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600', border: 'border-emerald-300', glow: 'shadow-emerald-500/50' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-slate-900 border-2 border-amber-400/50 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
        {/* Background ambient decorative glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />

        <h3 className="text-xl sm:text-2xl font-black text-white font-['Outfit'] uppercase tracking-wider mb-2">
          Choose Next Color
        </h3>
        <p className="text-xs sm:text-sm text-slate-300 mb-6">
          Pick the active color for the table:
        </p>

        <div className="grid grid-cols-2 gap-4">
          {colors.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectColor(c.id)}
              className={`${c.bg} ${c.border} border-3 h-24 sm:h-28 rounded-2xl flex flex-col items-center justify-center shadow-lg ${c.glow} transition-all duration-150 transform hover:scale-105 active:scale-95 text-white font-extrabold text-lg sm:text-xl font-['Fredoka'] cursor-pointer`}
            >
              <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
