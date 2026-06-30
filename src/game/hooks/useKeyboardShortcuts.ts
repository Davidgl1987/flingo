import { useEffect } from 'react';
import { useGameStore } from '../stores/useGameStore';

export function useKeyboardShortcuts() {
  const setWeapon = useGameStore((state) => state.setWeapon);
  const resetRun = useGameStore((state) => state.resetRun);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '1') setWeapon('body');
      if (event.key === '2') setWeapon('arrow');
      if (event.key === '3') setWeapon('spell');
      if (event.key.toLowerCase() === 'r') resetRun();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resetRun, setWeapon]);
}
