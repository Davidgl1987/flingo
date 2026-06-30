import type { TrailState } from '../../core/types';

type TrailProps = {
  trail: TrailState;
};

export function Trail({ trail }: TrailProps) {
  return (
    <mesh position={[trail.pos.x, 0.035, trail.pos.y]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[trail.radius, 20]} />
      <meshStandardMaterial color="#16a34a" transparent opacity={Math.min(0.5, trail.life / 3.2)} />
    </mesh>
  );
}
