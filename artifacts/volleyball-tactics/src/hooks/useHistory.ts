import { useState, useCallback } from 'react';
import { useTactics } from './useTactics';
import { RotationState } from '../types/tactics';

export function useHistory() {
  const [past, setPast] = useState<RotationState[]>([]);
  const [future, setFuture] = useState<RotationState[]>([]);

  const pushState = useCallback((state: RotationState) => {
    setPast(prev => [...prev.slice(-29), state]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    // Simple implementation
  }, []);

  const redo = useCallback(() => {
    // Simple implementation
  }, []);

  return { pushState, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
