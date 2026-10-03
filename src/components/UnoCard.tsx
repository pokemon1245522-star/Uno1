import React from 'react';
import { Card, PlayableColor } from '../../shared/types';
import { Ban, RefreshCw, Layers } from 'lucide-react';

interface UnoCardProps {
  card?: Card;
  isBack?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isPlayable?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  badgeText?: string;
}

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  isBack = false,
  size = 'md',
  isPlayable = false,
  isSelected = false,
  onClick,
  className = '',
  badgeText,
}) => {
  // Dimensions per size
  const sizeClasses = {
    xs: 'w-8 h-12 text-[10px] rounded-sm shadow-xs',
    sm: 'w-12 h-18 text-xs rounded-md shadow-sm',
    md: 'w-18 h-26 sm:w-20 sm:h-30 text-sm rounded-lg shadow-md',
    lg: 'w-24 h-36 sm:w-28 sm:h-42 text-base rounded-xl shadow-lg',
    xl: 'w-32 h-48 sm:w-36 sm:h-54 text-lg rounded-2xl shadow-xl',
  }[size];

  if (isBack || !card) {
    return (
      <div
        onClick={onClick}
        className={`relative select-none flex flex-col items-center justify-center bg-slate-900 border-2 border-amber-400/80 shadow-2xl transition-all duration-200 ${sizeClasses} ${className} ${
          onClick ? 'cursor-pointer hover:-translate-y-1 hover:border-amber-300' : ''
        }`}
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
        }}
      >
        <div className="w-[82%] h-[82%] rounded-full bg-red-600 flex items-center justify-center rotate-[-25deg] shadow-inner border border-red-400">
          <span className="font-extrabold text-amber-300 tracking-tight drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] text-center text-xs sm:text-sm font-['Fredoka']">
            UNO
          </span>
        </div>
        {badgeText && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
            {badgeText}
          </div>
        )}
      </div>
    );
  }

  // Color palette
  const colorBgMap: Record<string, string> = {
    red: 'from-red-500 via-red-600 to-red-700 border-red-300 text-red-600',
    blue: 'from-sky-500 via-blue-600 to-blue-700 border-sky-300 text-blue-600',
    green: 'from-emerald-500 via-green-600 to-green-700 border-emerald-300 text-green-600',
    yellow: 'from-amber-400 via-yellow-500 to-amber-600 border-yellow-200 text-amber-600',
    wild: 'from-slate-900 via-slate-800 to-black border-purple-400 text-purple-400',
  };

  const bgGradient = colorBgMap[card.color] || colorBgMap.wild;

  // Render symbol
  const renderSymbol = (isSmall = false) => {
    switch (card.value) {
      case 'skip':
        return <Ban className={isSmall ? 'w-2.5 h-2.5' : 'w-6 h-6 sm:w-8 sm:h-8 stroke-[2.8]'} />;
      case 'reverse':
        return <RefreshCw className={isSmall ? 'w-2.5 h-2.5' : 'w-6 h-6 sm:w-8 sm:h-8 stroke-[2.8]'} />;
      case 'draw2':
        return (
          <div className="flex items-center justify-center font-black">
            <span>+2</span>
          </div>
        );
      case 'wild':
        return (
          <div className={`relative ${isSmall ? 'w-3 h-3' : 'w-8 h-8 sm:w-10 sm:h-10'} rounded-full overflow-hidden flex flex-wrap border border-white/60 shadow-inner`}>
            <div className="w-1/2 h-1/2 bg-red-500" />
            <div className="w-1/2 h-1/2 bg-blue-500" />
            <div className="w-1/2 h-1/2 bg-yellow-400" />
            <div className="w-1/2 h-1/2 bg-emerald-500" />
          </div>
        );
      case 'wild_draw4':
        return (
          <div className="flex flex-col items-center justify-center">
            <span className={`font-black text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${isSmall ? 'text-[9px]' : 'text-base sm:text-xl'}`}>
              +4
            </span>
            {!isSmall && (
              <div className="flex gap-0.5 mt-0.5">
                <span className="w-2 h-3 bg-red-500 rounded-[1px] border border-white/40" />
                <span className="w-2 h-3 bg-blue-500 rounded-[1px] border border-white/40 -ml-1" />
                <span className="w-2 h-3 bg-yellow-400 rounded-[1px] border border-white/40 -ml-1" />
                <span className="w-2 h-3 bg-green-500 rounded-[1px] border border-white/40 -ml-1" />
              </div>
            )}
          </div>
        );
      default:
        // Number 0-9
        return (
          <span className={`font-black font-['Outfit'] tracking-tighter ${isSmall ? 'text-[11px]' : 'text-2xl sm:text-4xl'}`}>
            {card.value}
          </span>
        );
    }
  };

  return (
    <div
      onClick={isPlayable && onClick ? onClick : undefined}
      className={`relative select-none flex flex-col justify-between p-1 sm:p-1.5 border-2 bg-gradient-to-br shadow-lg transition-all duration-200 ${bgGradient} ${sizeClasses} ${className} ${
        isPlayable
          ? 'cursor-pointer ring-2 sm:ring-4 ring-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.6)] hover:-translate-y-3 hover:scale-105 active:scale-95 z-10'
          : onClick
          ? 'opacity-85'
          : 'opacity-90'
      } ${isSelected ? '-translate-y-3 ring-4 ring-emerald-400 shadow-2xl' : ''}`}
      style={{
        boxShadow: isPlayable ? '0 8px 24px -2px rgba(245, 158, 11, 0.45)' : undefined,
      }}
    >
      {/* Top Left corner index */}
      <div className="self-start flex flex-col items-center leading-none text-white font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
        {renderSymbol(true)}
      </div>

      {/* Center Angled Oval */}
      <div className="absolute inset-x-2 sm:inset-x-3 inset-y-4 sm:inset-y-5 rounded-[50%] bg-white/95 flex items-center justify-center rotate-[-22deg] shadow-inner overflow-hidden border border-white/80">
        <div className="rotate-[22deg] flex items-center justify-center text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
          {renderSymbol(false)}
        </div>
      </div>

      {/* Bottom Right inverted corner index */}
      <div className="self-end rotate-180 flex flex-col items-center leading-none text-white font-black drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
        {renderSymbol(true)}
      </div>

      {/* Playable indicator dot */}
      {isPlayable && (
        <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
      )}
    </div>
  );
};
