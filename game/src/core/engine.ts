import { GROWTHS, initialUnits, RULES, TERRAINS, WEAPONS } from '../data/gameplay';
import type {
  Action,
  ActionResult,
  CombatFamily,
  CombatForecast,
  CombatSide,
  Faction,
  GameEvent,
  GameState,
  MapData,
  Position,
  ReachableTile,
  SaveEnvelope,
  Stats,
  TerrainId,
  Unit,
} from './types';

const HERO_IDS = ['liu_bei', 'guan_yu', 'zhang_fei'];
const key = ({ x, y }: Position) => `${x},${y}`;
const positionOrder = (a: Position, b: Position) => a.y - b.y || a.x - b.x;
const samePosition = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
export const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const isOpponent = (a: Faction, b: Faction) => (a === 'enemy') !== (b === 'enemy');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const withinMap = (map: MapData, p: Position) =>
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x < map.width &&
  p.y < map.height;
const tileAt = (map: MapData, p: Position) => map.tiles.find((t) => samePosition(t, p));
export const terrainAt = (map: MapData, p: Position): TerrainId => tileAt(map, p)?.terrain ?? 'cliff';
export const isPassable = (map: MapData, p: Position): boolean => {
  const tile = tileAt(map, p);
  return withinMap(map, p) && !!tile && !tile.blocked && TERRAINS[tile.terrain]?.cost !== null;
};

function cloneState(state: GameState): GameState {
  return {
    ...state,
    units: state.units.map((u) => ({
      ...u,
      stats: { ...u.stats },
      statuses: u.statuses.map((s) => ({ ...s })),
    })),
    flags: { ...state.flags },
    log: [...state.log],
    roster: [...state.roster],
    mapState: { ...state.mapState, entities: { ...state.mapState.entities } },
  };
}

function unitById(state: GameState, id: string): Unit {
  const unit = state.units.find((u) => u.id === id);
  if (!unit) throw new Error(`找不到单位：${id}`);
  return unit;
}

function log(state: GameState, message: string) {
  state.log.push(message);
  if (state.log.length > 100) state.log = state.log.slice(-100);
}

function validateMap(map: MapData) {
  if (map.width !== 16 || map.height !== 12 || map.tileSize !== 64 || map.tiles.length !== 192) {
    throw new Error('首关地图必须包含完整的 16×12 个 64 像素格。');
  }
  const coords = new Set<string>();
  for (const tile of map.tiles) {
    if (!withinMap(map, tile) || coords.has(key(tile)) || !TERRAINS[tile.terrain] || tile.height !== 0) {
      throw new Error(`地图格数据无效：${key(tile)}`);
    }
    coords.add(key(tile));
  }
}

export function createBattle(seed: number = RULES.defaultSeed, map: MapData): GameState {
  validateMap(map);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('随机种子须为 0 至 4294967295 的整数。');
  const units = initialUnits();
  const occupied = new Set<string>();
  for (const unit of units) {
    const p = map.deployments.find((d) => d.unitId === unit.id);
    if (!p || !isPassable(map, p) || occupied.has(key(p))) throw new Error(`部署点无效或重叠：${unit.id}`);
    unit.x = p.x;
    unit.y = p.y;
    occupied.add(key(p));
  }
  return {
    version: 1,
    levelId: map.id,
    turn: 1,
    phase: 'player',
    status: 'battle',
    units,
    rngState: seed || 0x6d2b79f5,
    seed,
    flags: { intro_seen: true },
    roster: [...HERO_IDS],
    log: ['第一关 · 桃园结义。击败全部黄巾军，保护三兄弟。'],
    mapState: { version: map.version, entities: {} },
  };
}

function neighbors(map: MapData, p: Position): Position[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
    { x: p.x, y: p.y + 1 },
  ].filter((q) => withinMap(map, q));
}

interface SearchNode extends Position {
  cost: number;
  path: Position[];
}

function movementSearch(state: GameState, unit: Unit, map: MapData, budget = unit.stats.mov): SearchNode[] {
  if (!unit.alive) return [];
  const start: Position = { x: unit.x, y: unit.y };
  const queue: SearchNode[] = [{ ...start, cost: 0, path: [start] }];
  const costs = new Map<string, number>([[key(start), 0]]);
  const nodes: SearchNode[] = [];
  const blockers = new Set(
    state.units.filter((u) => u.alive && isOpponent(u.faction, unit.faction)).map(key),
  );
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || positionOrder(a, b));
    const current = queue.shift()!;
    if (current.cost !== costs.get(key(current))) continue;
    nodes.push(current);
    for (const next of neighbors(map, current)) {
      if (!isPassable(map, next) || blockers.has(key(next))) continue;
      const cost = current.cost + TERRAINS[terrainAt(map, next)].cost!;
      if (cost > budget || cost >= (costs.get(key(next)) ?? Infinity)) continue;
      costs.set(key(next), cost);
      queue.push({ ...next, cost, path: [...current.path, next] });
    }
  }
  return nodes;
}

export function movementRange(state: GameState, unitId: string, map: MapData): ReachableTile[] {
  const unit = unitById(state, unitId);
  const occupied = new Set(state.units.filter((u) => u.alive && u.id !== unitId).map(key));
  return movementSearch(state, unit, map)
    .filter((p) => !occupied.has(key(p)))
    .sort(positionOrder);
}

export function findPath(state: GameState, unitId: string, to: Position, map: MapData): Position[] | null {
  return movementRange(state, unitId, map).find((p) => samePosition(p, to))?.path ?? null;
}

export function attackSpeed(unit: Unit): number {
  return Math.max(0, unit.stats.spd - Math.max(0, WEAPONS[unit.weaponId].weight - unit.stats.con));
}

export function weaponAdvantage(a: CombatFamily, b: CombatFamily): -1 | 0 | 1 {
  const dominates: Partial<Record<CombatFamily, CombatFamily>> = {
    sword: 'axe',
    axe: 'spear',
    spear: 'sword',
  };
  if (dominates[a] === b) return 1;
  if (dominates[b] === a) return -1;
  return 0;
}

function canStrike(a: Unit, b: Unit): boolean {
  const weapon = WEAPONS[a.weaponId];
  return (
    a.alive &&
    b.alive &&
    isOpponent(a.faction, b.faction) &&
    distance(a, b) >= weapon.minRange &&
    distance(a, b) <= weapon.maxRange
  );
}

function combatSide(a: Unit, b: Unit, map: MapData): CombatSide {
  const weapon = WEAPONS[a.weaponId];
  const opponentWeapon = WEAPONS[b.weaponId];
  const advantage = weaponAdvantage(weapon.combatFamily, opponentWeapon.combatFamily);
  const targetTerrain = TERRAINS[terrainAt(map, b)];
  const physical = ['sword', 'axe', 'spear', 'bow'].includes(weapon.combatFamily);
  const skillHit = physical && a.skillId === 'wei_zhen' && a.hp * 2 >= a.stats.hp ? 5 : 0;
  const skillDamage = physical && a.skillId === 'dang_yang' && a.hp * 2 <= a.stats.hp ? 2 : 0;
  const damage = Math.max(
    0,
    a.stats.str +
      weapon.might +
      advantage * RULES.triangleAttack +
      skillDamage -
      b.stats.def -
      targetTerrain.defense,
  );
  const avoid = 2 * attackSpeed(b) + b.stats.luk + targetTerrain.avoid;
  const hit = clamp(
    weapon.hit +
      2 * a.stats.skl +
      Math.floor(a.stats.luk / 2) +
      advantage * RULES.triangleHit +
      skillHit -
      avoid,
    0,
    100,
  );
  const crit = clamp(weapon.crit + Math.floor(a.stats.skl / 2) - b.stats.luk, 0, 100);
  const canAttack = canStrike(a, b);
  return {
    unitId: a.id,
    name: a.name,
    hp: a.hp,
    maxHp: a.stats.hp,
    damage,
    hit,
    crit,
    attacks: canAttack ? 1 + Number(attackSpeed(a) - attackSpeed(b) >= RULES.followUpSpeed) : 0,
    canAttack,
    attackSpeed: attackSpeed(a),
    advantage,
    terrain: terrainAt(map, a),
    weaponName: weapon.name,
  };
}

export function forecast(
  state: GameState,
  attackerId: string,
  defenderId: string,
  map: MapData,
  from?: Position,
): CombatForecast {
  const original = unitById(state, attackerId);
  const attacker = from ? { ...original, x: from.x, y: from.y } : original;
  const defender = unitById(state, defenderId);
  const a = combatSide(attacker, defender, map);
  const d = combatSide(defender, attacker, map);
  const validPosition = !from || !!findPath(state, attackerId, from, map);
  const legal = a.canAttack && validPosition;
  const order: string[] = [];
  if (legal) {
    order.push(attacker.id);
    if (d.canAttack) order.push(defender.id);
    if (a.attacks === 2) order.push(attacker.id);
    else if (d.attacks === 2 && d.canAttack) order.push(defender.id);
  }
  return {
    attacker: a,
    defender: d,
    order,
    legal,
    ...(!legal
      ? {
          reason: !validPosition
            ? '无法移动到该位置。'
            : !attacker.alive || !defender.alive
              ? '该单位已败退。'
              : !isOpponent(attacker.faction, defender.faction)
                ? '不能攻击同伴。'
                : '目标不在武器射程内。',
        }
      : {}),
  };
}

/** 每次调用只产生一个 0—99 判定值，预测和寻路不会调用。 */
function roll(state: GameState): number {
  let value = state.rngState;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return Math.floor((state.rngState / 0x100000000) * 100);
}

function addExperience(state: GameState, unit: Unit, amount: number, events: GameEvent[]) {
  unit.exp += amount;
  events.push({ type: 'experience', unitId: unit.id, amount, expAfter: unit.exp % RULES.experiencePerLevel });
  log(state, `${unit.name}获得 ${amount} 经验。`);
  while (unit.exp >= RULES.experiencePerLevel) {
    unit.exp -= RULES.experiencePerLevel;
    unit.level += 1;
    const gains: Partial<Stats> = {};
    for (const [attribute, chance] of Object.entries(GROWTHS[unit.id] ?? {})) {
      if (roll(state) < chance) {
        const stat = attribute as keyof Stats;
        unit.stats[stat] += 1;
        gains[stat] = 1;
        if (stat === 'hp') unit.hp = Math.min(unit.stats.hp, unit.hp + 1);
      }
    }
    events.push({ type: 'levelup', unitId: unit.id, level: unit.level, gains });
    log(state, `${unit.name}升至 Lv.${unit.level}！`);
  }
}

function resolveCombat(state: GameState, attacker: Unit, defender: Unit, map: MapData, events: GameEvent[]) {
  const prediction = forecast(state, attacker.id, defender.id, map);
  const participants = new Set<string>();
  const killers = new Set<string>();
  for (const id of prediction.order) {
    if (!attacker.alive || !defender.alive) break;
    const a = id === attacker.id ? attacker : defender;
    const b = id === attacker.id ? defender : attacker;
    if (!canStrike(a, b)) continue;
    const result = combatSide(a, b, map);
    if (b.x !== a.x) a.facing = b.x > a.x ? 1 : -1;
    const hit = roll(state) < result.hit;
    const critical = hit && roll(state) < result.crit;
    const damage = hit ? result.damage * (critical ? RULES.criticalMultiplier : 1) : 0;
    b.hp = Math.max(0, b.hp - damage);
    participants.add(a.id);
    events.push({ type: 'attack', unitId: a.id, targetId: b.id, damage, hit, critical, hpAfter: b.hp });
    log(
      state,
      hit
        ? `${a.name}${critical ? '暴击' : '攻击'}${b.name}，造成 ${damage} 伤害。`
        : `${b.name}回避了${a.name}的攻击。`,
    );
    if (b.hp === 0) {
      b.alive = false;
      killers.add(a.id);
      events.push({ type: 'defeat', unitId: b.id });
      log(state, `${b.name}败退。`);
    }
  }
  for (const unit of [attacker, defender]) {
    if (unit.faction === 'player' && unit.alive && participants.has(unit.id)) {
      addExperience(
        state,
        unit,
        RULES.participationExperience + (killers.has(unit.id) ? RULES.defeatExperience : 0),
        events,
      );
    }
  }
}

function checkOutcome(state: GameState, events: GameEvent[]) {
  if (state.status !== 'battle') return;
  if (HERO_IDS.some((id) => !unitById(state, id).alive)) {
    state.status = 'defeat';
    events.push({ type: 'failure' });
    log(state, '三兄弟中有人败退，本关失败。');
  } else if (!state.units.some((u) => u.faction === 'enemy' && u.alive)) {
    state.status = 'victory';
    events.push({ type: 'victory' });
    log(state, '黄巾散兵已全部击败！');
  }
}

export function commitAction(original: GameState, action: Action, map: MapData): ActionResult {
  if (original.status !== 'battle') throw new Error('战斗已经结束。');
  const originalUnit = unitById(original, action.unitId);
  if (!originalUnit.alive || originalUnit.acted || originalUnit.faction !== original.phase)
    throw new Error('该单位当前不能行动。');
  if (!['attack', 'heal', 'wait'].includes(action.type)) throw new Error('未知行动。');
  const path = findPath(original, action.unitId, action.to, map);
  if (!path) throw new Error('无法移动到该位置。');
  if (action.type === 'attack') {
    if (!action.targetId) throw new Error('请选择攻击目标。');
    const preview = forecast(original, action.unitId, action.targetId, map, action.to);
    if (!preview.legal) throw new Error(preview.reason);
  }
  if (action.type === 'heal' && (originalUnit.potions <= 0 || originalUnit.hp >= originalUnit.stats.hp)) {
    throw new Error(originalUnit.potions <= 0 ? '伤药已经用尽。' : '生命已满，无需使用伤药。');
  }
  const state = cloneState(original);
  const events: GameEvent[] = [];
  const unit = unitById(state, action.unitId);
  if (path.length > 1) {
    events.push({ type: 'move', unitId: unit.id, path });
    for (let i = 1; i < path.length; i++)
      if (path[i].x !== path[i - 1].x) unit.facing = path[i].x > path[i - 1].x ? 1 : -1;
    unit.x = action.to.x;
    unit.y = action.to.y;
  }
  // 先承诺行动，再生成表现事件。动画完成与取消都不能恢复行动次数。
  unit.acted = true;
  if (action.type === 'attack') resolveCombat(state, unit, unitById(state, action.targetId!), map, events);
  else if (action.type === 'heal') {
    const amount = Math.min(RULES.potionHealing, unit.stats.hp - unit.hp);
    unit.hp += amount;
    unit.potions -= 1;
    events.push({ type: 'heal', unitId: unit.id, sourceId: unit.id, amount, hpAfter: unit.hp });
    log(state, `${unit.name}使用伤药，恢复 ${amount} 点生命。`);
  } else events.push({ type: 'wait', unitId: unit.id });
  checkOutcome(state, events);
  return { state, events };
}

function beginPhase(state: GameState, phase: Faction, events: GameEvent[]) {
  state.phase = phase;
  for (const unit of state.units) if (unit.faction === phase && unit.alive) unit.acted = false;
  events.push({ type: 'phase', phase, turn: state.turn });
  log(
    state,
    `第 ${state.turn} 回合 · ${phase === 'player' ? '我方' : phase === 'enemy' ? '敌军' : '友军'}阶段。`,
  );
  if (phase === 'player') {
    for (const source of state.units.filter(
      (u) => u.alive && u.faction === 'player' && u.skillId === 'ren_de',
    )) {
      for (const unit of state.units.filter(
        (u) =>
          u.alive &&
          !isOpponent(u.faction, source.faction) &&
          u.id !== source.id &&
          distance(u, source) === 1,
      )) {
        const amount = Math.min(RULES.renDeHealing, unit.stats.hp - unit.hp);
        if (amount <= 0) continue;
        unit.hp += amount;
        events.push({ type: 'heal', unitId: unit.id, sourceId: source.id, amount, hpAfter: unit.hp });
        log(state, `仁德使${unit.name}恢复 ${amount} 点生命。`);
      }
    }
  }
}

function advancePhase(state: GameState, events: GameEvent[]) {
  if (state.status !== 'battle') return;
  if (state.phase === 'player')
    beginPhase(state, state.units.some((u) => u.alive && u.faction === 'ally') ? 'ally' : 'enemy', events);
  else if (state.phase === 'ally') beginPhase(state, 'enemy', events);
  else {
    state.turn += 1;
    beginPhase(state, 'player', events);
  }
}

export function endPlayerPhase(original: GameState, _map: MapData): ActionResult {
  if (original.status !== 'battle' || original.phase !== 'player') throw new Error('当前不能结束我方阶段。');
  const state = cloneState(original);
  for (const unit of state.units) if (unit.faction === 'player' && unit.alive) unit.acted = true;
  const events: GameEvent[] = [];
  checkOutcome(state, events);
  advancePhase(state, events);
  return { state, events };
}

/** AI 仅依据公开数值评分；不读取或试投未来随机数。 */
export function chooseAIAction(state: GameState, unitId: string, map: MapData): Action {
  const unit = unitById(state, unitId);
  const reachable = movementRange(state, unitId, map);
  const targets = state.units
    .filter((u) => u.alive && isOpponent(u.faction, unit.faction))
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidates: Array<{ action: Action; kill: number; value: number; cost: number }> = [];
  for (const tile of reachable)
    for (const target of targets) {
      const movedUnit = { ...unit, x: tile.x, y: tile.y };
      if (!canStrike(movedUnit, target)) continue;
      // 可达性已经由同一寻路器验证，避免枚举每个落点时重复运行 Dijkstra。
      const a = combatSide(movedUnit, target, map);
      const d = combatSide(target, movedUnit, map);
      const damage = a.damage * a.attacks;
      const expected = Math.min(target.hp, ((damage * a.hit) / 100) * (1 + (2 * a.crit) / 100));
      const risk = a.damage >= target.hp && a.hit === 100 ? 0 : (d.damage * d.attacks * d.hit) / 100;
      candidates.push({
        action: { type: 'attack', unitId, targetId: target.id, to: { x: tile.x, y: tile.y } },
        kill: Number(damage >= target.hp && a.hit > 0),
        value: expected - risk * 0.6,
        cost: tile.cost,
      });
    }
  candidates.sort(
    (a, b) =>
      b.kill - a.kill ||
      b.value - a.value ||
      a.cost - b.cost ||
      a.action.targetId!.localeCompare(b.action.targetId!) ||
      positionOrder(a.action.to, b.action.to),
  );
  if (candidates.length) return candidates[0].action;

  // 找到沿实际通路最接近敌人的落点，避免隔着建筑按曼哈顿距离原地打转。
  const unrestricted = movementSearch(state, unit, map, Infinity);
  let approach: { destination: ReachableTile; remaining: number; targetId: string } | null = null;
  for (const target of targets) {
    const weapon = WEAPONS[unit.weaponId];
    const attackTiles = unrestricted.filter(
      (p) =>
        distance(p, target) >= weapon.minRange &&
        distance(p, target) <= weapon.maxRange &&
        !state.units.some((u) => u.alive && u.id !== unit.id && samePosition(u, p)),
    );
    attackTiles.sort((a, b) => a.cost - b.cost || positionOrder(a, b));
    for (const goal of attackTiles) {
      const legalOnPath = reachable.filter((p) => goal.path.some((q) => samePosition(p, q)));
      legalOnPath.sort((a, b) => b.cost - a.cost || positionOrder(a, b));
      const destination = legalOnPath[0];
      if (!destination) continue;
      const remaining = goal.cost - destination.cost;
      if (
        !approach ||
        remaining < approach.remaining ||
        (remaining === approach.remaining &&
          (target.id.localeCompare(approach.targetId) < 0 ||
            (target.id === approach.targetId && positionOrder(destination, approach.destination) < 0)))
      ) {
        approach = { destination, remaining, targetId: target.id };
      }
      break;
    }
  }
  return {
    type: 'wait',
    unitId,
    to: approach ? { x: approach.destination.x, y: approach.destination.y } : { x: unit.x, y: unit.y },
  };
}

export function nextEnemyAction(original: GameState, map: MapData): ActionResult {
  if (original.status !== 'battle') return { state: original, events: [] };
  if (original.phase === 'player') throw new Error('我方阶段不能执行敌军行动。');
  const next = original.units
    .filter((u) => u.alive && !u.acted && u.faction === original.phase)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) {
    const state = cloneState(original);
    const events: GameEvent[] = [];
    advancePhase(state, events);
    return { state, events };
  }
  const result = commitAction(original, chooseAIAction(original, next.id, map), map);
  if (!result.state.units.some((u) => u.alive && !u.acted && u.faction === result.state.phase))
    advancePhase(result.state, result.events);
  return result;
}

export function enemyThreat(state: GameState, map: MapData): Position[] {
  const threatened = new Map<string, Position>();
  for (const enemy of state.units.filter((u) => u.alive && u.faction === 'enemy')) {
    const weapon = WEAPONS[enemy.weaponId];
    for (const from of movementRange(state, enemy.id, map)) {
      for (let dy = -weapon.maxRange; dy <= weapon.maxRange; dy++)
        for (let dx = -weapon.maxRange; dx <= weapon.maxRange; dx++) {
          const target = { x: from.x + dx, y: from.y + dy };
          const range = Math.abs(dx) + Math.abs(dy);
          if (
            withinMap(map, target) &&
            isPassable(map, target) &&
            range >= weapon.minRange &&
            range <= weapon.maxRange
          )
            threatened.set(key(target), target);
        }
    }
  }
  return [...threatened.values()].sort(positionOrder);
}

export function completeVictory(original: GameState): ActionResult {
  if (original.status === 'complete') return { state: original, events: [] };
  if (original.status !== 'victory') throw new Error('尚未取得胜利。');
  const state = cloneState(original);
  state.status = 'complete';
  state.flags.victory_story_seen = true;
  state.flags.jian_yong_recruited = true;
  const events: GameEvent[] = [];
  if (!state.roster.includes('jian_yong')) {
    state.roster.push('jian_yong');
    events.push({ type: 'recruit', unitId: 'jian_yong' });
    log(state, '简雍加入了队伍。第一关已完成，进度已可保存。');
  }
  return { state, events };
}

export function serialize(state: GameState): string {
  if (state.status === 'battle' && state.phase !== 'player') throw new Error('请等待我方阶段再保存。');
  const envelope: SaveEnvelope = {
    schema: 'sanguo-fire-emblem',
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(envelope);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, lo: number, hi: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;

export function restore(raw: string, map: MapData): GameState {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('存档内容无法解析；原数据已保留。');
  }
  if (
    !isRecord(value) ||
    value.schema !== 'sanguo-fire-emblem' ||
    value.version !== 1 ||
    !isRecord(value.state)
  ) {
    throw new Error('存档版本不兼容；原数据已保留。');
  }
  const state = value.state;
  const invalid = () => {
    throw new Error('存档内容不完整或与当前地图不匹配；原数据已保留。');
  };
  if (
    state.version !== 1 ||
    state.levelId !== map.id ||
    !integer(state.turn, 1, 99999) ||
    !['player', 'ally', 'enemy'].includes(String(state.phase)) ||
    !['battle', 'victory', 'defeat', 'complete'].includes(String(state.status)) ||
    (state.status === 'battle' && state.phase !== 'player') ||
    !integer(state.rngState, 1, 0xffffffff) ||
    !integer(state.seed, 0, 0xffffffff) ||
    !Array.isArray(state.units) ||
    state.units.length !== 9 ||
    !Array.isArray(state.roster) ||
    !isRecord(state.flags) ||
    Object.values(state.flags).some((v) => typeof v !== 'boolean') ||
    !Array.isArray(state.log) ||
    state.log.length > 100 ||
    state.log.some((v) => typeof v !== 'string') ||
    typeof value.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !isRecord(state.mapState) ||
    state.mapState.version !== map.version ||
    !isRecord(state.mapState.entities) ||
    Object.values(state.mapState.entities).some((v) => typeof v !== 'string')
  )
    invalid();
  const units = state.units as unknown[];
  const expected = initialUnits();
  const occupied = new Set<string>();
  const ids = new Set<string>();
  for (const entry of units) {
    if (!isRecord(entry)) invalid();
    const unit = entry as Record<string, unknown>;
    const template = expected.find((u) => u.id === unit.id);
    if (!template || ids.has(String(unit.id)) || unit.faction !== template.faction || !isRecord(unit.stats))
      invalid();
    const stats = unit.stats as Record<string, unknown>;
    for (const attribute of Object.keys(template!.stats))
      if (!integer(stats[attribute], attribute === 'hp' ? 1 : 0, 999)) invalid();
    if (
      !integer(unit.hp, 0, stats.hp as number) ||
      !integer(unit.level, 1, 99) ||
      !integer(unit.exp, 0, 99) ||
      !integer(unit.potions, 0, 99) ||
      !integer(unit.sp, 0, 999) ||
      !integer(unit.burst, 0, 100) ||
      typeof unit.alive !== 'boolean' ||
      unit.alive !== (unit.hp as number) > 0 ||
      typeof unit.acted !== 'boolean' ||
      ![-1, 1].includes(unit.facing as number) ||
      unit.weaponId !== template!.weaponId ||
      !Array.isArray(unit.statuses) ||
      unit.statuses.length !== 0 ||
      unit.skillId !== template!.skillId ||
      (
        ['name', 'classId', 'className', 'renderClassId', 'artWeaponId', 'portraitId', 'avatarId'] as const
      ).some((f) => unit[f] !== template![f])
    )
      invalid();
    const p = { x: unit.x as number, y: unit.y as number };
    if (!withinMap(map, p) || (unit.alive && (!isPassable(map, p) || occupied.has(key(p))))) invalid();
    if (unit.alive) occupied.add(key(p));
    ids.add(String(unit.id));
  }
  const roster = state.roster as unknown[];
  if (
    new Set(roster).size !== roster.length ||
    HERO_IDS.some((id) => !roster.includes(id)) ||
    roster.some((id) => typeof id !== 'string' || ![...HERO_IDS, 'jian_yong'].includes(id))
  )
    invalid();
  const restored = state as unknown as GameState;
  const heroDefeated = restored.units.some((u) => HERO_IDS.includes(u.id) && !u.alive);
  const enemiesAlive = restored.units.some((u) => u.faction === 'enemy' && u.alive);
  if (
    (restored.status === 'battle' && (heroDefeated || !enemiesAlive)) ||
    (restored.status === 'defeat' && !heroDefeated) ||
    (['victory', 'complete'].includes(restored.status) && (heroDefeated || enemiesAlive)) ||
    (restored.status === 'complete' &&
      (!restored.flags.victory_story_seen ||
        !restored.flags.jian_yong_recruited ||
        !roster.includes('jian_yong'))) ||
    (restored.status !== 'complete' && (restored.flags.jian_yong_recruited || roster.includes('jian_yong')))
  )
    invalid();
  return cloneState(restored);
}
