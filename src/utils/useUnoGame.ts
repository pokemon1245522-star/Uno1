import { useState } from 'react';
import { useUnoPeer } from './useUnoPeer';
import { useUnoFirebase } from './useUnoFirebase';
import { GameRules, PlayableColor, Card } from '../../shared/types';

export type MultiplayerMode = 'p2p' | 'firebase';

export function useUnoGame() {
  const [mode, setMode] = useState<MultiplayerMode>('p2p');

  const p2pEngine = useUnoPeer();
  const firebaseEngine = useUnoFirebase();

  // Active engine based on mode
  const activeEngine = mode === 'p2p' ? p2pEngine : firebaseEngine;

  return {
    ...activeEngine,
    mode,
    setMode,
    p2pEngine,
    firebaseEngine,
  };
}
