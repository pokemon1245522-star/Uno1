import React, { useState } from 'react';
import { GameRules, DEFAULT_RULES } from '../../shared/types';
import { Play, Users, BookOpen, Settings as SettingsIcon, Sparkles, Copy, ArrowRight, Shield } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface MainMenuProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  onCreateRoom: (settings: Partial<GameRules>) => void;
  onJoinRoom: (roomId: string) => void;
  onOpenHowToPlay: () => void;
  onOpenSettings: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

const AVATARS = ['🦊', '🐱', '🦁', '🐼', '🐸', '🦄', '🤖', '🐲', '🐯', '🐵', '🚀', '⭐'];

export const MainMenu: React.FC<MainMenuProps> = ({
  playerName,
  setPlayerName,
  avatar,
  setAvatar,
  onCreateRoom,
  onJoinRoom,
  onOpenHowToPlay,
  onOpenSettings,
  isLoading,
  errorMessage,
}) => {
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [joinCode, setJoinCode] = useState('');
  const [customRules, setCustomRules] = useState<GameRules>({ ...DEFAULT_RULES });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    soundManager.playClick();
    onCreateRoom(customRules);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !joinCode.trim()) return;
    soundManager.playClick();
    onJoinRoom(joinCode.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Dynamic Background Ambient Lighting */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10 flex flex-col items-center">
        {/* Logo and Brand */}
        <div className="text-center mb-6 relative">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 text-xs font-semibold mb-3 shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Real-Time Multiplayer Card Game
          </div>

          <div className="relative flex items-center justify-center">
            {/* Playful UNO Cards fan behind title */}
            <div className="absolute -left-6 top-0 w-12 h-16 bg-red-600 rounded-lg -rotate-12 border border-white/50 shadow-md opacity-70" />
            <div className="absolute -right-6 top-0 w-12 h-16 bg-blue-600 rounded-lg rotate-12 border border-white/50 shadow-md opacity-70" />

            <h1 className="text-5xl sm:text-6xl font-black font-['Fredoka'] tracking-tight text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] relative z-10">
              <span className="text-red-500">U</span>
              <span className="text-amber-400">N</span>
              <span className="text-emerald-400">O</span>
              <span className="text-sky-400 ml-2">LIVE</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 font-medium">
            Create a room, share code, and play anywhere.
          </p>
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="w-full mb-4 p-3 bg-red-950/80 border border-red-500/80 rounded-2xl text-red-200 text-xs text-center font-medium shadow-lg animate-in fade-in">
            {errorMessage}
          </div>
        )}

        {/* Profile Info Card (Name & Avatar) */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md mb-4">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 font-['Outfit']">
            Your Profile
          </label>

          <div className="flex items-center gap-3 mb-3">
            <div className="relative group">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-amber-400/60 flex items-center justify-center text-3xl shadow-inner cursor-pointer hover:scale-105 transition-transform">
                {avatar}
              </div>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your nickname"
                maxLength={16}
                className="w-full bg-slate-950 text-white font-semibold text-sm px-4 py-3 rounded-2xl border border-slate-700 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              />
            </div>
          </div>

          {/* Quick Avatar selection bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xl">
            {AVATARS.map((av) => (
              <button
                key={av}
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setAvatar(av);
                }}
                className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                  avatar === av ? 'bg-amber-500/30 scale-125 border border-amber-400' : 'hover:scale-110 opacity-70'
                }`}
              >
                {av}
              </button>
            ))}
          </div>
        </div>

        {/* Card Views based on Mode */}
        {mode === 'home' && (
          <div className="w-full space-y-3">
            <button
              onClick={() => {
                soundManager.playClick();
                onCreateRoom(customRules);
              }}
              disabled={isLoading || !playerName.trim()}
              className="w-full py-4 px-6 bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500 hover:opacity-95 disabled:opacity-50 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-between transition cursor-pointer font-['Outfit'] tracking-wide"
            >
              <div className="flex items-center gap-3">
                <Play className="w-5 h-5 fill-slate-950" />
                <span>Create New Room</span>
              </div>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                soundManager.playClick();
                setMode('join');
              }}
              disabled={isLoading || !playerName.trim()}
              className="w-full py-4 px-6 bg-slate-800/90 hover:bg-slate-750 disabled:opacity-50 text-white font-bold text-base rounded-2xl border border-slate-700 shadow-xl flex items-center justify-between transition cursor-pointer font-['Outfit']"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-sky-400" />
                <span>Join with Room Code</span>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400" />
            </button>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  soundManager.playClick();
                  onOpenHowToPlay();
                }}
                className="py-3 px-4 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-medium text-xs rounded-2xl border border-slate-800 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-amber-400" />
                How to Play
              </button>

              <button
                onClick={() => {
                  soundManager.playClick();
                  onOpenSettings();
                }}
                className="py-3 px-4 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-medium text-xs rounded-2xl border border-slate-800 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4 text-slate-400" />
                Audio & Options
              </button>
            </div>
          </div>
        )}

        {/* Create Room View */}
        {mode === 'create' && (
          <form onSubmit={handleCreateSubmit} className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm font-['Outfit']">Room Rules Configuration</h3>
              <button
                type="button"
                onClick={() => setMode('home')}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Max Players (2 - 8)</label>
                <select
                  value={customRules.maxPlayers}
                  onChange={(e) => setCustomRules({ ...customRules, maxPlayers: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium cursor-pointer"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>{n} Players</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Starting Hand Size</label>
                <select
                  value={customRules.startingCards}
                  onChange={(e) => setCustomRules({ ...customRules, startingCards: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium cursor-pointer"
                >
                  <option value={5}>5 cards (Fast game)</option>
                  <option value={7}>7 cards (Standard UNO)</option>
                  <option value={9}>9 cards (Longer game)</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-1">
                <span>Stacking Draw (+2 on +2, +4 on +4)</span>
                <input
                  type="checkbox"
                  checked={customRules.stackingDraw}
                  onChange={(e) => setCustomRules({ ...customRules, stackingDraw: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <span>Jump-In Rule (play exact match out of turn)</span>
                <input
                  type="checkbox"
                  checked={customRules.jumpIn}
                  onChange={(e) => setCustomRules({ ...customRules, jumpIn: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <span>7-0 Rule (7 swaps hand, 0 rotates hands)</span>
                <input
                  type="checkbox"
                  checked={customRules.sevenZero}
                  onChange={(e) => setCustomRules({ ...customRules, sevenZero: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !playerName.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-2xl shadow-xl transition cursor-pointer font-['Outfit']"
            >
              {isLoading ? 'Creating Room...' : 'Start Room Lobby'}
            </button>
          </form>
        )}

        {/* Join Room View */}
        {mode === 'join' && (
          <form onSubmit={handleJoinSubmit} className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm font-['Outfit']">Join with Room Code</h3>
              <button
                type="button"
                onClick={() => setMode('home')}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Back
              </button>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">Room Code (6 Characters)</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. B4K8Z2"
                maxLength={8}
                className="w-full bg-slate-950 text-amber-400 font-mono font-bold text-center text-xl tracking-widest px-4 py-3 rounded-2xl border border-slate-700 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !playerName.trim() || !joinCode.trim()}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-black rounded-2xl shadow-xl transition cursor-pointer font-['Outfit']"
            >
              {isLoading ? 'Joining...' : 'Enter Game Room'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
