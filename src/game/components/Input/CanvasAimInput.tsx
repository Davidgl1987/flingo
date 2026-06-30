import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { useGameStore } from '../../stores/useGameStore';
import type { Vec2 } from '../../core/types';

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

export function CanvasAimInput() {
  const { camera, gl } = useThree();
  const startAimAt = useGameStore((state) => state.startAimAt);
  const updateAimAt = useGameStore((state) => state.updateAimAt);
  const releaseAim = useGameStore((state) => state.releaseAim);
  const cancelAim = useGameStore((state) => state.cancelAim);

  useEffect(() => {
    const canvas = gl.domElement;
    const pointer = new Vector2();
    const hit = new Vector3();
    const raycaster = new Raycaster();
    let activePointerId: number | null = null;

    const getFloorPoint = (event: PointerEvent): Vec2 | null => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.intersectPlane(FLOOR_PLANE, hit);
      if (!point) return null;
      return { x: point.x, y: point.z };
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (activePointerId !== null || event.button !== 0) return;
      const point = getFloorPoint(event);
      if (!point) return;

      activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      startAimAt(point);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      const point = getFloorPoint(event);
      if (!point) return;

      event.preventDefault();
      updateAimAt(point);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;
      const point = getFloorPoint(event);
      if (point) updateAimAt(point);

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      activePointerId = null;
      event.preventDefault();
      releaseAim();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      activePointerId = null;
      event.preventDefault();
      cancelAim();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [camera, cancelAim, gl, releaseAim, startAimAt, updateAimAt]);

  return null;
}
