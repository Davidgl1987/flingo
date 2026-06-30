import type { EffectState, EffectType, GameState, Vec2 } from './types';

const EFFECT_COLORS: Record<EffectType, string> = {
  launch: '#38bdf8',
  projectile: '#fef08a',
  impact: '#f8fafc',
  death: '#fb7185',
  explosion: '#fb923c',
  pickup: '#facc15',
  heal: '#f472b6',
  damage: '#ef4444',
  shield: '#bfdbfe',
};

const EFFECT_DEFAULTS: Record<EffectType, Pick<EffectState, 'radius' | 'duration' | 'height' | 'shake'>> = {
  launch: { radius: 0.5, duration: 0.32, height: 0.08, shake: 0 },
  projectile: { radius: 0.38, duration: 0.22, height: 0.1, shake: 0.08 },
  impact: { radius: 0.42, duration: 0.26, height: 0.18, shake: 0.28 },
  death: { radius: 0.7, duration: 0.46, height: 0.2, shake: 0.34 },
  explosion: { radius: 1.5, duration: 0.5, height: 0.16, shake: 0.72 },
  pickup: { radius: 0.32, duration: 0.35, height: 0.24, shake: 0.08 },
  heal: { radius: 0.46, duration: 0.38, height: 0.28, shake: 0.12 },
  damage: { radius: 0.58, duration: 0.42, height: 0.22, shake: 0.48 },
  shield: { radius: 0.64, duration: 0.34, height: 0.22, shake: 0.25 },
};

type EffectOptions = Partial<Pick<EffectState, 'radius' | 'duration' | 'height' | 'shake' | 'color' | 'dir'>>;

export function addEffect(state: GameState, type: EffectType, pos: Vec2, options: EffectOptions = {}): void {
  const defaults = EFFECT_DEFAULTS[type];
  const duration = options.duration ?? defaults.duration;
  state.effects.push({
    id: `effect-${state.nextId++}`,
    type,
    pos: { ...pos },
    dir: options.dir ? { ...options.dir } : undefined,
    radius: options.radius ?? defaults.radius,
    life: duration,
    duration,
    color: options.color ?? EFFECT_COLORS[type],
    height: options.height ?? defaults.height,
    shake: options.shake ?? defaults.shake,
  });
}
