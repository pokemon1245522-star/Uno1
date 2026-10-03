import React from 'react';
import { Card, PlayableColor } from '../../shared/types';
import { Ban, RefreshCw, Sparkles, Layers } from 'lucide-react';

interface UnoCardProps {
  card?: Card;
  isBack?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isPlayable?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
  onClick?: () => void;
  className?: string;
  badgeText?: string;
  rotation?: number; // Tilt angle in degrees for natural hand fanning
}

export const UnoCard: React.FC<UnoCardProps> = ({
  card,
  isBack = false,
  size = 'md',
  isPlayable = false,
  isSelected = false,
  isHovered = false,
  onClick,
  className = '',
  badgeText,
  rotation = 0,
}) => {
  // Sizing matrix with exact aspect ratios (approx 2:3)
  const sizeClasses = {
    xs: 'w-9 h-13 text-[10px] rounded-lg shadow-sm',
    sm: 'w-13 h-19 text-xs rounded-xl shadow-md',
    md: 'w-20 h-30 sm:w-22 sm:h-33 text-sm rounded-2xl shadow-xl',
    lg: 'w-28 h-42 sm:w-32 sm:h-48 text-base rounded-2xl shadow-2xl',
    xl: 'w-36 h-54 sm:w-40 sm:h-60 text-lg rounded-3xl shadow-2xl',
  }[size];

  // CARD BACK (Textured authentic UNO back with 3D embossed logo)
  if (isBack || !card) {
    return (
      <div
        onClick={onClick}
        className={`relative select-none flex flex-col items-center justify-center border-2 border-amber-400/90 overflow-hidden transition-all duration-300 transform-gpu ${sizeClasses} ${className} ${
          onClick ? 'cursor-pointer hover:scale-105 hover:border-amber-300 hover:shadow-amber-400/30 active:scale-95' : ''
        }`}
        style={{
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          background: 'radial-gradient(ellipse at 30% 20%, #1e1b4b 0%, #0f172a 60%, #020617 100%)',
          boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Card gloss sheen reflection */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />

        {/* Outer border trim */}
        <div className="absolute inset-1 rounded-[inherit] border border-amber-500/30 pointer-events-none" />

        {/* Center tilted red flame oval */}
        <div
          className="w-[82%] h-[78%] rounded-[50%] bg-gradient-to-br from-red-500 via-red-600 to-red-800 flex items-center justify-center rotate-[-26deg] shadow-lg border-2 border-amber-300/80 overflow-hidden relative"
          style={{
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -3px 6px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Inner oval shine */}
          <div className="absolute top-1 left-2 w-12 h-6 bg-white/20 rounded-full blur-[2px] pointer-events-none" />

          {/* 3D Extruded UNO Logo */}
          <span
            className="font-black text-amber-300 tracking-tighter text-center font-['Fredoka'] select-none transform rotate-[4deg]"
            style={{
              fontSize: size === 'xs' ? '12px' : size === 'sm' ? '16px' : size === 'md' ? '24px' : size === 'lg' ? '38px' : '48px',
              textShadow: '0 2px 0 #b45309, 0 4px 0 #78350f, 0 6px 4px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.6)',
              WebkitTextStroke: size === 'xs' ? '0.5px #000' : '1.5px #000',
            }}
          >
            UNO
          </span>
        </div>

        {badgeText && (
          <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-amber-200">
            {badgeText}
          </div>
        )}
      </div>
    );
  }

  // CARD FRONT: Rich dynamic gradients and authentic design
  const colorStyles: Record<
    string,
    {
      bgGradient: string;
      border: string;
      glow: string;
      textColor: string;
      accentBg: string;
    }
  > = {
    red: {
      bgGradient: 'bg-gradient-to-br from-red-500 via-rose-600 to-red-800',
      border: 'border-red-300/70',
      glow: 'shadow-[0_0_25px_rgba(244,63,94,0.6)] ring-amber-300',
      textColor: 'text-red-600',
      accentBg: 'bg-red-600',
    },
    blue: {
      bgGradient: 'bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-800',
      border: 'border-sky-300/70',
      glow: 'shadow-[0_0_25px_rgba(56,189,248,0.6)] ring-amber-300',
      textColor: 'text-blue-600',
      accentBg: 'bg-blue-600',
    },
    green: {
      bgGradient: 'bg-gradient-to-br from-emerald-400 via-green-600 to-emerald-900',
      border: 'border-emerald-300/70',
      glow: 'shadow-[0_0_25px_rgba(52,211,153,0.6)] ring-amber-300',
      textColor: 'text-emerald-600',
      accentBg: 'bg-emerald-600',
    },
    yellow: {
      bgGradient: 'bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700',
      border: 'border-yellow-200/90',
      glow: 'shadow-[0_0_25px_rgba(251,191,36,0.65)] ring-white',
      textColor: 'text-amber-600',
      accentBg: 'bg-amber-500',
    },
    wild: {
      bgGradient: 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-950',
      border: 'border-purple-400/80',
      glow: 'shadow-[0_0_30px_rgba(168,85,247,0.7)] ring-purple-300',
      textColor: 'text-purple-600',
      accentBg: 'bg-purple-600',
    },
  };

  const style = colorStyles[card.color] || colorStyles.wild;

  // Render symbol (number or action icon)
  const renderSymbol = (isSmall = false) => {
    switch (card.value) {
      case 'skip':
        return (
          <div className="relative flex items-center justify-center">
            <Ban
              className={`${
                isSmall ? 'w-3 h-3 stroke-[3]' : 'w-8 h-8 sm:w-11 sm:h-11 stroke-[3.2]'
              } drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]`}
            />
          </div>
        );
      case 'reverse':
        return (
          <div className="relative flex items-center justify-center">
            <RefreshCw
              className={`${
                isSmall ? 'w-3 h-3 stroke-[3]' : 'w-8 h-8 sm:w-11 sm:h-11 stroke-[3.2]'
              } drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]`}
            />
          </div>
        );
      case 'draw2':
        return (
          <div className="flex flex-col items-center justify-center font-black font-['Fredoka']">
            <span
              className={`${
                isSmall ? 'text-[11px]' : 'text-2xl sm:text-4xl'
              } drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]`}
            >
              +2
            </span>
          </div>
        );
      case 'wild':
        return (
          <div
            className={`relative ${
              isSmall ? 'w-3.5 h-3.5' : 'w-10 h-10 sm:w-14 sm:h-14'
            } rounded-full overflow-hidden flex flex-wrap border-2 border-white shadow-xl`}
          >
            <div className="w-1/2 h-1/2 bg-red-500 shadow-inner" />
            <div className="w-1/2 h-1/2 bg-sky-500 shadow-inner" />
            <div className="w-1/2 h-1/2 bg-amber-400 shadow-inner" />
            <div className="w-1/2 h-1/2 bg-emerald-500 shadow-inner" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent pointer-events-none" />
            <div className="absolute inset-1/4 rounded-full bg-slate-900/40 blur-[1px] pointer-events-none" />
          </div>
        );
      case 'wild_draw4':
        return (
          <div className="flex flex-col items-center justify-center">
            <span
              className={`font-black font-['Fredoka'] text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${
                isSmall ? 'text-[11px]' : 'text-2xl sm:text-4xl'
              }`}
              style={{
                textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(251,191,36,0.8)',
                WebkitTextStroke: isSmall ? '0.5px #000' : '1px #000',
              }}
            >
              +4
            </span>
            {!isSmall && (
              <div className="flex -space-x-1.5 mt-0.5">
                <span className="w-2.5 h-4 bg-red-500 rounded-xs border border-white shadow-md transform -rotate-12" />
                <span className="w-2.5 h-4 bg-sky-500 rounded-xs border border-white shadow-md transform -rotate-4" />
                <span className="w-2.5 h-4 bg-amber-400 rounded-xs border border-white shadow-md transform rotate-6" />
                <span className="w-2.5 h-4 bg-emerald-500 rounded-xs border border-white shadow-md transform rotate-14" />
              </div>
            )}
          </div>
        );
      default:
        // Number 0-9 with custom high-contrast typography and subtle drop-shadow
        return (
          <span
            className={`font-black font-['Fredoka'] tracking-tight ${
              isSmall ? 'text-[13px] leading-none' : 'text-3xl sm:text-5xl leading-none'
            }`}
            style={{
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            {card.value}
          </span>
        );
    }
  };

  return (
    <div
      onClick={isPlayable && onClick ? onClick : undefined}
      className={`relative select-none flex flex-col justify-between p-1.5 sm:p-2 border-2 overflow-hidden transition-all duration-300 transform-gpu ${sizeClasses} ${style.bgGradient} ${style.border} ${className} ${
        isPlayable
          ? `cursor-pointer ring-3 sm:ring-4 ${style.glow} hover:-translate-y-4 hover:scale-110 active:scale-95 z-20`
          : onClick
          ? 'opacity-85'
          : 'opacity-95'
      } ${isSelected ? '-translate-y-5 scale-110 ring-4 ring-emerald-400 shadow-2xl z-30' : ''} ${
        isHovered ? '-translate-y-4 scale-108 z-25' : ''
      }`}
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        boxShadow: isPlayable
          ? '0 12px 28px -2px rgba(0, 0, 0, 0.5), 0 0 15px rgba(251, 191, 36, 0.45)'
          : '0 6px 16px -2px rgba(0, 0, 0, 0.4)',
      }}
    >
      {/* Specular metallic sheen overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/18 to-transparent pointer-events-none" />

      {/* Subtle border inset highlight */}
      <div className="absolute inset-0.5 rounded-[inherit] border border-white/20 pointer-events-none" />

      {/* Top Left Corner Index */}
      <div className="self-start flex flex-col items-center leading-none text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] z-10">
        {renderSymbol(true)}
      </div>

      {/* Signature Center Angled Oval (The iconic UNO look) */}
      <div
        className="absolute inset-x-2 sm:inset-x-3 inset-y-4 sm:inset-y-5 rounded-[50%] bg-gradient-to-b from-white via-slate-50 to-slate-100 flex items-center justify-center rotate-[-24deg] shadow-lg overflow-hidden border border-white/90 z-5"
        style={{
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15), 0 3px 8px rgba(0,0,0,0.3)',
        }}
      >
        {/* Subtle inner oval bevel shine */}
        <div className="absolute top-1 left-2 w-10 h-5 bg-white/60 rounded-full blur-[1px] pointer-events-none" />

        {/* Counter-rotate symbol so it stands upright with 3D drop-shadow */}
        <div
          className={`rotate-[24deg] flex items-center justify-center font-black ${
            card.color === 'wild' ? 'text-slate-900' : style.textColor
          }`}
        >
          {renderSymbol(false)}
        </div>
      </div>

      {/* Bottom Right Inverted Corner Index */}
      <div className="self-end flex flex-col items-center leading-none text-white font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] rotate-180 z-10">
        {renderSymbol(true)}
      </div>

      {/* Playable Neon Beacon / Play Indicator */}
      {isPlayable && (
        <div className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 p-1 rounded-full shadow-lg border border-white animate-pulse z-20">
          <Sparkles className="w-2.5 h-2.5 fill-slate-950" />
        </div>
      )}
    </div>
  );
};
