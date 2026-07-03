/**
 * Loop raíz: hace tick de la sim con acumulador de timestep fijo (60 Hz)
 * dentro de useFrame. Guarda la posición previa del héroe para que los
 * componentes de render interpolen. React NUNCA está en el hot path para la
 * sim: aquí no hay setState por frame de física, solo mutación del objeto
 * sesión. El único setState (zustand) ocurre cuando un evento discreto de
 * gameplay cambia HP/monedas/llave/fase, no una vez por frame.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { FIXED_DT } from '../content/constants';
import { ensureUpgradeChoices, type GameSession } from '../session';
import { drainEvents, type GameEvent } from '../sim/events';
import { stepWorld } from '../sim/step';
import type { GamePhase } from '../sim/world';
import { useUiStore } from '../store';

/** Tope de tiempo de frame acumulable (evita la espiral de la muerte en tabs suspendidas). */
const MAX_FRAME_TIME = 0.25;

const NOTICE_BY_EVENT: Partial<Record<GameEvent['type'], string>> = {
  'room-cleared': 'Sala limpiada',
  'pit-fall': 'Has caído al foso',
};

export function useGameLoop(session: GameSession): void {
  // Snapshot de los últimos valores sincronizados al store, para no llamar
  // setState si nada de baja frecuencia cambió este frame.
  const lastSynced = useRef<{
    hp: number;
    maxHp: number;
    coins: number;
    hasKey: boolean;
    phase: GamePhase;
    roomsCleared: number;
    score: number;
  }>({ hp: -1, maxHp: -1, coins: -1, hasKey: false, phase: 'playing', roomsCleared: -1, score: -1 });

  const runFrame = (delta: number): void => {
    const world = session.world;
    world.heroAiming = session.aim.active;
    let accumulator = session.accumulator + (delta > MAX_FRAME_TIME ? MAX_FRAME_TIME : delta);
    while (accumulator >= FIXED_DT) {
      session.heroPrevX = world.hero.position.x;
      session.heroPrevY = world.hero.position.y;
      stepWorld(world, session.events);
      accumulator -= FIXED_DT;
    }
    session.accumulator = accumulator;
    session.renderAlpha = accumulator / FIXED_DT;

    drainEvents(session.events, (event) => {
      const notice = NOTICE_BY_EVENT[event.type];
      if (notice) {
        useUiStore.getState().showNotice(notice);
      }
    });

    if (world.phase === 'room-cleared') {
      ensureUpgradeChoices(session);
    }

    const hero = world.hero;
    const snap = lastSynced.current;
    if (
      hero.hp !== snap.hp ||
      hero.maxHp !== snap.maxHp ||
      world.stats.coinsCollected !== snap.coins ||
      hero.hasKey !== snap.hasKey ||
      world.phase !== snap.phase ||
      world.stats.roomsCleared !== snap.roomsCleared ||
      world.stats.score !== snap.score
    ) {
      snap.hp = hero.hp;
      snap.maxHp = hero.maxHp;
      snap.coins = world.stats.coinsCollected;
      snap.hasKey = hero.hasKey;
      snap.phase = world.phase;
      snap.roomsCleared = world.stats.roomsCleared;
      snap.score = world.stats.score;
      useUiStore.getState().syncFromWorld({
        hp: hero.hp,
        maxHp: hero.maxHp,
        coins: world.stats.coinsCollected,
        hasKey: hero.hasKey,
        phase: world.phase,
        roomsCleared: world.stats.roomsCleared,
        score: world.stats.score,
      });
    }
  };

  useFrame((_, delta) => runFrame(delta));

  // Puente de depuración SOLO en dev: permite avanzar la sim desde la consola
  // o herramientas de verificación aunque el tab esté oculto (RAF pausado).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__flingo = {
      session,
      frame: runFrame,
      tick: (seconds: number) => {
        const frames = Math.max(1, Math.round(seconds * 60));
        for (let i = 0; i < frames; i++) runFrame(1 / 60);
      },
    };
    return () => {
      delete window.__flingo;
    };
    // runFrame se recrea por render pero captura la misma sesión mutable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);
}

declare global {
  interface Window {
    __flingo?: {
      session: GameSession;
      frame: (delta: number) => void;
      tick: (seconds: number) => void;
    };
  }
}
