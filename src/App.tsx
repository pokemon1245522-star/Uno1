/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useUnoPeer } from './utils/useUnoPeer';
import { MainMenu } from './components/MainMenu';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';
import { ColorPickerModal } from './components/ColorPickerModal';
import { ResultsModal } from './components/ResultsModal';
import { HowToPlayModal } from './components/HowToPlayModal';
import { SettingsModal } from './components/SettingsModal';
import { ChatPanel } from './components/ChatPanel';
import { Card, PlayableColor, GameRules } from '../shared/types';
import { WifiOff, Wifi } from 'lucide-react';

export default function App() {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('uno_player_name') || `Player_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [avatar, setAvatar] = useState(() => {
    return localStorage.getItem('uno_avatar') || '🦊';
  });

  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const {
    syncState,
    chatMessages,
    isConnected,
    errorMessage,
    setErrorMessage,
    toastMessage,
    pendingWildCard,
    setPendingWildCard,
    createRoom,
    joinRoom,
    leaveRoom,
    toggleReady,
    updateSettings,
    kickPlayer,
    startGame,
    playCard,
    chooseColor,
    drawCard,
    passTurn,
    callUno,
    catchUno,
    playAgain,
    sendChat,
  } = useUnoPeer();

  // Save profile changes to localStorage
  useEffect(() => {
    localStorage.setItem('uno_player_name', playerName);
  }, [playerName]);

  useEffect(() => {
    localStorage.setItem('uno_avatar', avatar);
  }, [avatar]);

  // Check URL params for invite link (?room=XYZ)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !syncState) {
      joinRoom(roomParam.toUpperCase(), playerName, avatar);
    }
  }, [joinRoom, playerName, avatar, syncState]);

  // Determine current screen
  const isLobby = syncState?.gameState.status === 'lobby';
  const isPlaying = syncState?.gameState.status === 'playing';
  const isRoundEnded = syncState?.gameState.status === 'round_ended' || syncState?.gameState.status === 'game_over';

  const myPlayerId = syncState?.myPlayerId || '';
  const me = syncState?.gameState.players.find((p) => p.id === myPlayerId);
  const isHost = me?.isHost || false;

  // Color picker should open if pendingWildCard is set OR server has pendingColorChoice for me
  const isColorPickerOpen = Boolean(
    pendingWildCard ||
    (syncState?.gameState.pendingColorChoice && syncState.gameState.pendingColorPlayerId === myPlayerId)
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-['Fredoka'] antialiased select-none relative">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-4 inset-x-0 z-50 flex justify-center pointer-events-none px-4 animate-in fade-in slide-in-from-top-4">
          <div className="bg-slate-900/95 border-2 border-amber-400 text-amber-300 font-bold px-4 py-2 rounded-2xl shadow-2xl text-xs sm:text-sm max-w-md text-center backdrop-blur-md">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Disconnection Warning Bar */}
      {!isConnected && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-600/90 text-white text-xs font-bold py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow-lg backdrop-blur-sm">
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Connecting to game server... Trying to reconnect.</span>
        </div>
      )}

      {/* View router */}
      {!syncState ? (
        <MainMenu
          playerName={playerName}
          setPlayerName={setPlayerName}
          avatar={avatar}
          setAvatar={setAvatar}
          onCreateRoom={(settings) => createRoom(playerName, avatar, settings)}
          onJoinRoom={(roomId) => joinRoom(roomId, playerName, avatar)}
          onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isLoading={!isConnected}
          errorMessage={errorMessage}
        />
      ) : isLobby ? (
        <Lobby
          gameState={syncState.gameState}
          myPlayerId={myPlayerId}
          onStartGame={startGame}
          onToggleReady={toggleReady}
          onKickPlayer={kickPlayer}
          onLeaveRoom={leaveRoom}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onUpdateSettings={updateSettings}
        />
      ) : (
        <GameTable
          syncState={syncState}
          onPlayCard={(cardId, chosenColor) => playCard(cardId, chosenColor)}
          onDrawCard={drawCard}
          onPassTurn={passTurn}
          onCallUno={callUno}
          onCatchUno={catchUno}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRequestColorPick={(card) => setPendingWildCard(card)}
        />
      )}

      {/* Wild Color Selection Modal */}
      <ColorPickerModal
        isOpen={isColorPickerOpen}
        onSelectColor={(color) => chooseColor(color)}
      />

      {/* Round & Game Winner Results Modal */}
      {isRoundEnded && syncState && (
        <ResultsModal
          gameState={syncState.gameState}
          myPlayerId={myPlayerId}
          isHost={isHost}
          onPlayAgain={playAgain}
          onReturnToLobby={leaveRoom}
          onLeaveRoom={leaveRoom}
        />
      )}

      {/* Chat & Activity Overlay */}
      {syncState && (
        <ChatPanel
          messages={chatMessages}
          onSendMessage={sendChat}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(!isChatOpen)}
        />
      )}

      {/* Rules Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isHost={isHost}
        isLobby={isLobby}
        settings={syncState?.gameState.settings}
        onUpdateSettings={updateSettings}
        onLeaveRoom={syncState ? leaveRoom : undefined}
      />
    </div>
  );
}
