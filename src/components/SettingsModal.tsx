import React from 'react';
import { GameRules } from '../../shared/types';
import { X, Volume2, VolumeX, Settings, LogOut, Check } from 'lucide-react';
import { soundManager } from '../utils/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  isLobby: boolean;
  settings?: GameRules;
  onUpdateSettings?: (newSettings: Partial<GameRules>) => void;
  onLeaveRoom?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isHost,
  isLobby,
  settings,
  onUpdateSettings,
  onLeaveRoom,
}) => {
  const [isMuted, setIsMuted] = React.useState(soundManager.getMuted());
  const [volume, setVolume] = React.useState(soundManager.getVolume());

  if (!isOpen) return null;

  const handleMuteToggle = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundManager.setMuted(next);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    soundManager.setVolume(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="text-xl font-black text-white font-['Outfit']">Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-5 text-sm">
          {/* Audio Controls */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400 font-['Outfit']">
              Sound Effects
            </h4>
            <div className="flex items-center justify-between">
              <span className="text-slate-200">Mute Audio</span>
              <button
                onClick={handleMuteToggle}
                className={`p-2 rounded-xl border flex items-center gap-1.5 font-semibold text-xs transition cursor-pointer ${
                  isMuted
                    ? 'bg-red-950/60 border-red-500/50 text-red-400'
                    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {isMuted ? 'Muted' : 'Enabled'}
              </button>
            </div>
            {!isMuted && (
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Volume</span>
                  <span>{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Room Rules (Editable in Lobby if host) */}
          {settings && (
            <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400 font-['Outfit']">
                  Game Rules {isHost && isLobby ? '(Host Config)' : ''}
                </h4>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Starting Cards</span>
                  {isHost && isLobby && onUpdateSettings ? (
                    <select
                      value={settings.startingCards}
                      onChange={(e) => onUpdateSettings({ startingCards: parseInt(e.target.value) })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white cursor-pointer"
                    >
                      {[3, 5, 7, 10].map((n) => (
                        <option key={n} value={n}>{n} cards</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-white">{settings.startingCards} cards</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span>Turn Timer</span>
                  {isHost && isLobby && onUpdateSettings ? (
                    <select
                      value={settings.turnTimerSeconds}
                      onChange={(e) => onUpdateSettings({ turnTimerSeconds: parseInt(e.target.value) })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white cursor-pointer"
                    >
                      <option value={15}>15 seconds</option>
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={0}>No timer</option>
                    </select>
                  ) : (
                    <span className="font-bold text-white">
                      {settings.turnTimerSeconds > 0 ? `${settings.turnTimerSeconds}s` : 'Disabled'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span>Stacking (+2 on +2)</span>
                  {isHost && isLobby && onUpdateSettings ? (
                    <input
                      type="checkbox"
                      checked={settings.stackingDraw}
                      onChange={(e) => onUpdateSettings({ stackingDraw: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  ) : (
                    <span className="font-bold text-white">{settings.stackingDraw ? 'Yes' : 'No'}</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span>Jump-In (exact match out of turn)</span>
                  {isHost && isLobby && onUpdateSettings ? (
                    <input
                      type="checkbox"
                      checked={settings.jumpIn}
                      onChange={(e) => onUpdateSettings({ jumpIn: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  ) : (
                    <span className="font-bold text-white">{settings.jumpIn ? 'Yes' : 'No'}</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span>7-0 Rule (7 swap, 0 rotate)</span>
                  {isHost && isLobby && onUpdateSettings ? (
                    <input
                      type="checkbox"
                      checked={settings.sevenZero}
                      onChange={(e) => onUpdateSettings({ sevenZero: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  ) : (
                    <span className="font-bold text-white">{settings.sevenZero ? 'Yes' : 'No'}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Leave Room Button */}
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="w-full py-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/50 text-red-200 font-bold rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer text-xs"
            >
              <LogOut className="w-4 h-4" />
              Leave Room
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition cursor-pointer text-xs"
        >
          Close
        </button>
      </div>
    </div>
  );
};
