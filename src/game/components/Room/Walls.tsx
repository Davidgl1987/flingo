type WallsProps = {
  width: number;
  height: number;
};

export function Walls({ width, height }: WallsProps) {
  const thickness = 0.42;
  const wallColor = '#475569';
  return (
    <group>
      <mesh position={[0, 0.38, -height / 2 - thickness / 2]} castShadow receiveShadow>
        <boxGeometry args={[width + thickness * 2, 0.76, thickness]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[0, 0.38, height / 2 + thickness / 2]} castShadow receiveShadow>
        <boxGeometry args={[width + thickness * 2, 0.76, thickness]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[-width / 2 - thickness / 2, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, 0.76, height + thickness * 2]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
      <mesh position={[width / 2 + thickness / 2, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, 0.76, height + thickness * 2]} />
        <meshStandardMaterial color={wallColor} />
      </mesh>
    </group>
  );
}
