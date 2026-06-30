export type Vec2 = { x: number; y: number };

export type GamePhase = 'playing' | 'choosing-upgrade' | 'game-over' | 'victory';
export type WeaponMode = 'body' | 'arrow' | 'spell';
export type EnemyType = 'dummy' | 'chaser' | 'spike' | 'trail' | 'shooter';
export type HazardType = 'pit' | 'spikes' | 'barrel' | 'slow' | 'boost' | 'rock';
export type ItemType = 'coin' | 'potion' | 'key';
export type RoomTag = 'start' | 'combat' | 'key' | 'boss' | 'reward';
export type DoorSide = 'north' | 'south' | 'east' | 'west';

export type DoorSlot = {
  side: DoorSide;
  offset: number;
};
export type EffectType = 'launch' | 'projectile' | 'impact' | 'death' | 'explosion' | 'pickup' | 'heal' | 'damage' | 'shield';
export type UpgradeId =
  | 'impact_damage'
  | 'max_hp'
  | 'slippery'
  | 'sticky_boots'
  | 'explosive_body'
  | 'sharper_arrows'
  | 'arcane_spell'
  | 'quick_aim'
  | 'shield_start';

export type PlayerState = {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  bodyDamage: number;
  arrowDamage: number;
  spellDamage: number;
  weaponMode: WeaponMode;
  canAct: boolean;
  isAiming: boolean;
  aimStart: Vec2 | null;
  aimCurrent: Vec2 | null;
  lastSafePos: Vec2;
  invulnerableTimer: number;
  actionCooldown: number;
  actionCooldowns: Record<WeaponMode, number>;
  pitFallTimer: number;
  pitFallPos: Vec2 | null;
  pitFallActive: boolean;
  pitFallHeight: number;
  pitFallVerticalVelocity: number;
  upgrades: UpgradeId[];
  shieldCharges: number;
};

export type EnemyState = {
  id: string;
  type: EnemyType;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  contactCooldown: number;
  trailTimer: number;
  aiTimer?: number;
  patrolAnchor?: Vec2;
  patrolTarget?: Vec2;
  patrolAxis?: Vec2;
  patrolRange?: number;
  homePos?: Vec2;
  roomInstanceId?: string;
  shooterState?: 'chasing' | 'charging';
  shooterTimer?: number;
  hitFlashTimer?: number;
  spikeDir?: Vec2;
};

export type HazardState = {
  id: string;
  type: HazardType;
  pos: Vec2;
  radius?: number;
  width?: number;
  height?: number;
  dir?: Vec2;
  roomInstanceId?: string;
  exploded?: boolean;
  timer?: number;
};

export type ItemState = {
  id: string;
  type: ItemType;
  pos: Vec2;
  radius: number;
  collected: boolean;
  roomInstanceId?: string;
};

export type ProjectileState = {
  id: string;
  type: Exclude<WeaponMode, 'body'>;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  life: number;
  alive: boolean;
  hostile?: boolean;
  pierceRemaining?: number;
  bouncesRemaining?: number;
  hitEnemyIds?: string[];
};

export type TrailState = {
  id: string;
  pos: Vec2;
  radius: number;
  life: number;
  damage: number;
};

export type EffectState = {
  id: string;
  type: EffectType;
  pos: Vec2;
  dir?: Vec2;
  radius: number;
  life: number;
  duration: number;
  color: string;
  height: number;
  shake: number;
};

export type RoomDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  playerStart: Vec2;
  tags?: RoomTag[];
  doorSlots?: DoorSlot[];
  enemies: Omit<EnemyState, 'alive' | 'contactCooldown' | 'trailTimer' | 'hitFlashTimer' | 'vel'>[];
  hazards: HazardState[];
  items: ItemState[];
};

export type WorldRoomInstance = {
  id: string;
  roomId: string;
  name: string;
  width: number;
  height: number;
  offset: Vec2;
  tags: RoomTag[];
  doorSlots: DoorSlot[];
  cleared: boolean;
  rotation?: 0 | 90 | 180 | 270;
};

export type WorldDoorConnection = {
  id: string;
  aRoomId: string;
  aSlot: DoorSlot;
  bRoomId: string;
  bSlot: DoorSlot;
  open: boolean;
  requiresKey?: boolean;
  unlocked?: boolean;
};

export type WorldMapState = {
  rooms: WorldRoomInstance[];
  connections: WorldDoorConnection[];
  startRoomId: string;
  keyRoomId: string;
  bossRoomId: string;
};

export type GameState = {
  phase: GamePhase;
  isPaused: boolean;
  currentRoomIndex: number;
  roomsCleared: number;
  roomClearRewardTimer: number;
  coins: number;
  score: number;
  message: string;
  room: {
    id: string;
    name: string;
    width: number;
    height: number;
    cleared: boolean;
  };
  worldMap: WorldMapState | null;
  currentRoomInstanceId: string | null;
  hasKey: boolean;
  player: PlayerState;
  enemies: EnemyState[];
  hazards: HazardState[];
  items: ItemState[];
  projectiles: ProjectileState[];
  trails: TrailState[];
  effects: EffectState[];
  upgradeChoices: UpgradeId[];
  nextId: number;
};
