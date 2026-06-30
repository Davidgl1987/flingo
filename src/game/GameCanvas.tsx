import { useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { DirectionalLight, Object3D } from 'three';
import { Scene } from './components/Scene';
import { useGameStore } from './stores/useGameStore';

function FollowLight() {
  const lightRef = useRef<DirectionalLight>(null);
  const targetRef = useRef<Object3D | null>(null);

  if (!targetRef.current) {
    targetRef.current = new Object3D();
  }
  const target = targetRef.current;

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target;
    }
  }, [target]);

  useFrame(() => {
    const p = useGameStore.getState().player.pos;
    if (lightRef.current) {
      lightRef.current.position.set(p.x + 3, 8, p.y + 6);
    }
    target.position.set(p.x, 0, p.y);
    target.updateMatrixWorld();
  });

  return (
    <>
      <directionalLight
        ref={lightRef}
        intensity={2.6}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0001}
        shadow-normalBias={0.04}
      />
      <primitive object={target} />
    </>
  );
}

export function GameCanvas() {
  return (
    <div className="h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.35]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 13, 10], fov: 45, near: 0.1, far: 100 }}
      >
        <color attach="background" args={["#111827"]} />
        <ambientLight intensity={1.8} />
        <FollowLight />
        <Scene />
      </Canvas>
    </div>
  );
}
