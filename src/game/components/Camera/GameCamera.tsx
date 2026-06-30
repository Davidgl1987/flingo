import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../../stores/useGameStore';

const CAMERA_DIRECTION = new Vector3(0, 13, 10).normalize();
const ROOM_PADDING = 1.4;
const FLOOR_VERTICAL_PROJECTION = CAMERA_DIRECTION.y;
const SHAKE_MULTIPLIER = 0.95;

function isPerspectiveCamera(camera: unknown): camera is PerspectiveCamera {
  return camera instanceof PerspectiveCamera;
}

export function GameCamera() {
  const playerPos = useGameStore((state) => state.player.pos);
  const effects = useGameStore((state) => state.effects);
  const phase = useGameStore((state) => state.phase);
  const isAiming = useGameStore((state) => state.player.isAiming);
  const aimStart = useGameStore((state) => state.player.aimStart);
  const { camera, size } = useThree();

  useFrame(({ clock }) => {
    const verticalFov = MathUtils.degToRad(isPerspectiveCamera(camera) ? camera.fov : 42);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height));
    const followedAreaWidth = size.width < 700 ? 8.4 : 10.8;
    const followedAreaHeight = size.width < 700 ? 10.2 : 9.2;
    const screenHalfWidth = followedAreaWidth / 2 + ROOM_PADDING;
    const screenHalfHeight = (followedAreaHeight * FLOOR_VERTICAL_PROJECTION) / 2 + ROOM_PADDING;
    const baseTargetDistance = Math.max(
      screenHalfHeight / Math.tan(verticalFov / 2),
      screenHalfWidth / Math.tan(horizontalFov / 2),
    );
    const zoomFactor = isAiming ? 0.92 : 1;

    const shake = phase === 'playing' ? effects.reduce((max, effect) => {
      const intensity = effect.shake * Math.max(0, effect.life / effect.duration);
      return Math.max(max, intensity);
    }, 0) * SHAKE_MULTIPLIER : 0;
    const shakeOffset = new Vector3(
      Math.sin(clock.elapsedTime * 43) * shake,
      Math.sin(clock.elapsedTime * 61) * shake * 0.45,
      Math.cos(clock.elapsedTime * 47) * shake,
    );
    const targetShakeOffset = new Vector3(
      Math.sin(clock.elapsedTime * 37 + 1.4) * shake * 0.38,
      0,
      Math.cos(clock.elapsedTime * 41 + 0.7) * shake * 0.38,
    );

    const playerTarget = new Vector3(playerPos.x, 0, playerPos.y);
    const aimTarget = isAiming && aimStart ? new Vector3(aimStart.x, 0, aimStart.y) : playerTarget;
    const cameraTarget = playerTarget.clone().lerp(aimTarget, 0.18 * (1 - zoomFactor));
    const cameraPosition = cameraTarget.clone().add(CAMERA_DIRECTION.clone().multiplyScalar(baseTargetDistance * zoomFactor));

    camera.position.lerp(cameraPosition, 0.18);
    camera.position.add(shakeOffset);
    camera.lookAt(cameraTarget.clone().add(targetShakeOffset));
  });

  return null;
}
