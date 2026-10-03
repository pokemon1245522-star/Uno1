import React, { useState } from 'react';
import { PublicGameState, GameRules } from '../../shared/types';
import { Users, Crown, Copy, Check, Play, UserMinus, Shield, Share2, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface LobbyProps {
  gameState: PublicGameState;
  myPlayerId: string;
  onStartGame: () => void;
  onToggleReady: () => void;
  onKickPlayer: (targetId: string) => void;
  onLeaveRoom: () => void;
  onOpenSettings: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  gameState,
  myPlayerId,
  onStartGame,
  onToggleReady,
  onKickPlayer,
  onLeaveRoom,
  onOpenSettings,
}) => {
  const [copied, setCopied] = useState(false);
  const me = gameState.players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost || false;
  const activePlayers = gameState.players.filter((p) => !p.isSpectator);
  const canStart = isHost && activePlayers.length >= 2;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(gameState.roomId);
    setCopied(true);
    soundManager.playClick();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}?room=${gameState.roomId}`;
    if (navigator.share) {
      navigator.share({
        title: 'Join my UNO Game!',
        text: `Join my UNO game room with code: ${gameState.roomId}`,
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Ambient background glows */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl z-10 flex flex-col items-center">
        {/* Top Header with Room Code */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block font-['Outfit']">
              Game Room Code
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-mono font-black text-amber-400 tracking-wider">
                {gameState.roomId}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                title="Copy Room Code"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleShareLink}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                title="Share Invite Link"
              >
                <Share2 className="w-4 h-4 text-sky-400" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer flex items-center gap-1 text-xs"
            >
              <SettingsIcon className="w-4 h-4" />
              Rules
            </button>
            <button
              onClick={onLeaveRoom}
              className="p-2.5 rounded-2xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/40 transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <LogOut className="w-4 h-4" />
              Leave
            </button>
          </div>
        </div>

        {/* Players Grid */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md mb-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white font-['Outfit'] text-base">
                Players ({activePlayers.length} / {gameState.settings.maxPlayers})
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {activePlayers.length < 2 ? 'Need 1 more player to start' : 'Ready to start!'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gameState.players.map((p) => {
              const isMe = p.id === myPlayerId;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                    isMe
                      ? 'bg-slate-800/90 border-amber-500/60 shadow-md'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shadow-inner relative">
                      {p.avatar}
                      {p.isHost && (
                        <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 p-0.5 rounded-full shadow">
                          <Crown className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm flex items-center gap-1.5">
                        {p.name}
                        {isMe && <span className="text-[10px] text-sky-400 font-normal">(You)</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className={`inline-block w-2 h-2 rounded-full ${p.isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span>{p.isHost ? 'Host' : p.isReady ? 'Ready' : 'Not ready'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.isReady ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-500/40">
                        READY
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                        WAITING
                      </span>
                    )}

                    {isHost && !p.isHost && (
                      <button
                        onClick={() => onKickPlayer(p.id)}
                        className="p-1.5 rounded-xl hover:bg-red-950 text-slate-500 hover:text-red-400 transition cursor-pointer"
                        title="Kick player"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty player slot placeholders */}
            {Array.from({ length: Math.max(0, 2 - activePlayers.length) }).map((_, i) => (
              <div
                key={`empty_${i}`}
                className="p-3 rounded-2xl border-2 border-dashed border-slate-800 flex items-center gap-3 opacity-40 text-xs text-slate-400"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-lg">
                  ?
                </div>
                <span>Waiting for friend to join...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Lobby Actions */}
        <div className="w-full flex gap-3">
          {!isHost && (
            <button
              onClick={() => {
                soundManager.playClick();
                onToggleReady();
              }}
              className={`flex-1 py-4 font-black rounded-2xl shadow-xl transition cursor-pointer font-['Outfit'] text-base flex items-center justify-center gap-2 ${
                me?.isReady
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/50'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
              }`}
            >
              {me?.isReady ? '✓ Ready (Click to Unready)' : 'Ready Up!'}
            </button>
          )}

          {isHost && (
            <button
              onClick={() => {
                soundManager.playClick();
                onStartGame();
              }}
              disabled={!canStart}
              className="flex-1 py-4 bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-lg rounded-2xl shadow-2xl shadow-amber-500/30 flex items-center justify-center gap-2 transition cursor-pointer font-['Outfit'] tracking-wide"
            >
              <Play className="w-6 h-6 fill-slate-950" />
              <span>Start UNO Match</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
