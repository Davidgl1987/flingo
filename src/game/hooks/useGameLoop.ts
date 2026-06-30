import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/useGameStore';

export function useGameLoop() {
  const tick = useGameStore((state) => state.tick);
  useFrame((_, dt) => tick(dt));
}
