import { GameCanvas } from './GameCanvas';
import { HUD } from './components/UI/HUD';
import { UpgradeModal } from './components/UI/UpgradeModal';
import { EndModal } from './components/UI/EndModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useGameStore } from './stores/useGameStore';

export function Game() {
  useKeyboardShortcuts();
  const phase = useGameStore((state) => state.phase);

  return (
    <main className="relative h-full w-full">
      <GameCanvas />
      <HUD />
      {phase === 'choosing-upgrade' && <UpgradeModal />}
      {(phase === 'game-over' || phase === 'victory') && <EndModal />}
    </main>
  );
}
