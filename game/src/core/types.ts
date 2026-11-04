export type Faction = 'player' | 'ally' | 'enemy';
export type TerrainId = 'plain' | 'road' | 'bridge' | 'forest' | 'building' | 'water' | 'cliff';
export type CombatFamily = 'sword' | 'axe' | 'spear' | 'bow' | 'strategy' | 'support';
export interface Position {
  x: number;
  y: number;
}
export interface Stats {
  hp: number;
  str: number;
  int: number;
  skl: number;
  spd: number;
  luk: number;
  def: number;
  res: number;
  con: number;
  mov: number;
}
export interface Unit extends Position {
  id: string;
  name: string;
  faction: Faction;
  classId: string;
  className: string;
  renderClassId: string;
  artWeaponId: string;
  portraitId: string;
  avatarId: string;
  hp: number;
  stats: Stats;
  weaponId: string;
  level: number;
  exp: number;
  acted: boolean;
  alive: boolean;
  potions: number;
  skillId: string | null;
  facing: 1 | -1;
  sp: number;
  burst: number;
  statuses: Array<{ id: string; sourceId: string; turns: number }>;
}
export interface Weapon {
  id: string;
  name: string;
  artWeaponId: string;
  visualFamily: string;
  combatFamily: CombatFamily;
  might: number;
  hit: number;
  crit: number;
  weight: number;
  minRange: number;
  maxRange: number;
  durability: null;
}
export interface Terrain {
  name: string;
  cost: number | null;
  defense: number;
  avoid: number;
}
export interface MapData {
  id: string;
  version: number | string;
  width: number;
  height: number;
  tileSize: number;
  visualAssetId: string;
  tiles: Array<Position & { terrain: TerrainId; height: number; blocked?: boolean }>;
  deployments: Array<Position & { unitId: string }>;
  events?: unknown[];
  [key: string]: unknown;
}
export interface GameState {
  version: 1;
  levelId: string;
  turn: number;
  phase: Faction;
  status: 'battle' | 'victory' | 'defeat' | 'complete';
  units: Unit[];
  rngState: number;
  seed: number;
  flags: Record<string, boolean>;
  log: string[];
  roster: string[];
  mapState: { version: number | string; entities: Record<string, string> };
}
export interface ReachableTile extends Position {
  cost: number;
  path: Position[];
}
export interface CombatSide {
  unitId: string;
  name: string;
  hp: number;
  maxHp: number;
  damage: number;
  hit: number;
  crit: number;
  attacks: number;
  canAttack: boolean;
  attackSpeed: number;
  advantage: -1 | 0 | 1;
  terrain: TerrainId;
  weaponName: string;
}
export interface CombatForecast {
  attacker: CombatSide;
  defender: CombatSide;
  order: string[];
  legal: boolean;
  reason?: string;
}
export type GameEvent =
  | { type: 'move'; unitId: string; path: Position[] }
  | {
      type: 'attack';
      unitId: string;
      targetId: string;
      damage: number;
      hit: boolean;
      critical: boolean;
      hpAfter: number;
    }
  | { type: 'heal'; unitId: string; sourceId: string; amount: number; hpAfter: number }
  | { type: 'defeat'; unitId: string }
  | { type: 'experience'; unitId: string; amount: number; expAfter: number }
  | { type: 'levelup'; unitId: string; level: number; gains: Partial<Stats> }
  | { type: 'wait'; unitId: string }
  | { type: 'phase'; phase: Faction; turn: number }
  | { type: 'victory' | 'failure' }
  | { type: 'recruit'; unitId: string };
export interface Action {
  type: 'attack' | 'wait' | 'heal';
  unitId: string;
  to: Position;
  targetId?: string;
}
export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}
export interface SaveEnvelope {
  schema: 'sanguo-fire-emblem';
  version: 1;
  savedAt: string;
  state: GameState;
}
