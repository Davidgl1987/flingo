import { useGameLoop } from '../hooks/useGameLoop';
import { useGameStore } from '../stores/useGameStore';
import { AimIndicator } from './Player/AimIndicator';
import { Player } from './Player/Player';
import { Room } from './Room/Room';
import { Enemy } from './Enemies/Enemy';
import { Hazard } from './Hazards/Hazard';
import { Item } from './Items/Item';
import { Projectile } from './Weapons/Projectile';
import { Trail } from './Hazards/Trail';
import { GameCamera } from './Camera/GameCamera';
import { CanvasAimInput } from './Input/CanvasAimInput';
import { EffectBurst } from './Effects/EffectBurst';
import { WorldPhysics } from './Physics/WorldPhysics';

export function Scene() {
  useGameLoop();
  const enemies = useGameStore((state) => state.enemies);
  const hazards = useGameStore((state) => state.hazards);
  const items = useGameStore((state) => state.items);
  const projectiles = useGameStore((state) => state.projectiles);
  const trails = useGameStore((state) => state.trails);
  const effects = useGameStore((state) => state.effects);

  return (
    <>
      <GameCamera />
      <CanvasAimInput />
      <Room />
      {trails.map((trail) => <Trail key={trail.id} trail={trail} />)}
      {hazards.map((hazard) => <Hazard key={hazard.id} hazard={hazard} />)}
      {items.map((item) => <Item key={item.id} item={item} />)}
      {enemies.map((enemy) => <Enemy key={enemy.id} id={enemy.id} />)}
      {projectiles.map((projectile) => <Projectile key={projectile.id} projectile={projectile} />)}
      {effects.map((effect) => <EffectBurst key={effect.id} effect={effect} />)}
      <WorldPhysics>
        <Player />
      </WorldPhysics>
      <AimIndicator />
    </>
  );
}
