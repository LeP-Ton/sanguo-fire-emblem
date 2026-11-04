import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackSpeed,
  chooseAIAction,
  commitAction,
  completeVictory,
  createBattle,
  distance,
  endPlayerPhase,
  enemyThreat,
  findPath,
  forecast,
  movementRange,
  nextEnemyAction,
  restore,
  serialize,
  weaponAdvantage,
} from './engine';
import { initialUnits, WEAPONS } from '../data/gameplay';
import type { GameState, MapData, Position, TerrainId } from './types';

function mapFixture(): MapData {
  const ids = initialUnits().map((u) => u.id);
  return {
    id: 'test-peach-garden',
    version: 1,
    width: 16,
    height: 12,
    tileSize: 64,
    visualAssetId: 'plain_day',
    tiles: Array.from({ length: 192 }, (_, i) => ({
      x: i % 16,
      y: Math.floor(i / 16),
      terrain: 'plain',
      height: 0,
    })),
    deployments: ids.map((unitId, i) => ({
      unitId,
      x: i < 3 ? 1 : 12 + (i % 3),
      y: i < 3 ? i + 1 : 2 + Math.floor(i / 3) * 2,
    })),
  };
}

function setTerrain(map: MapData, x: number, y: number, terrain: TerrainId, blocked = false) {
  Object.assign(
    map.tiles.find((t) => t.x === x && t.y === y)!,
    { terrain, blocked },
  );
}

function duel(seed = 123456) {
  const map = mapFixture();
  const state = createBattle(seed, map);
  const a = state.units[0];
  const b = state.units[3];
  a.x = 5;
  a.y = 5;
  b.x = 6;
  b.y = 5;
  return { map, state, a, b };
}

const attack = (state: GameState, map: MapData, attackerId = 'liu_bei', targetId = 'yellow_1') => {
  const a = state.units.find((u) => u.id === attackerId)!;
  return commitAction(state, { type: 'attack', unitId: attackerId, targetId, to: { x: a.x, y: a.y } }, map);
};

test('完整地图与全部部署点可创建；重复、缺格和阻挡部署被拒绝', () => {
  const map = mapFixture();
  assert.equal(createBattle(0, map).units.length, 9);
  assert.throws(() => createBattle(1, { ...map, tiles: map.tiles.slice(1) }), /16×12/);
  map.deployments[1] = { ...map.deployments[0], unitId: 'guan_yu' };
  assert.throws(() => createBattle(1, map), /部署/);
});

test('进入森林支付2点；预览路径和范围采用相同带权通行规则', () => {
  const { state, map, a } = duel();
  a.stats.mov = 2;
  setTerrain(map, 5, 4, 'forest');
  const reachable = movementRange(state, a.id, map);
  assert.equal(reachable.find((t) => t.x === 5 && t.y === 4)?.cost, 2);
  assert.equal(findPath(state, a.id, { x: 5, y: 3 }, map), null);
  for (const tile of reachable) assert.deepEqual(findPath(state, a.id, tile, map), tile.path);
});

test('可以穿过同伴但不能停在同伴格；敌人阻挡狭窄通道', () => {
  const { state, map, a, b } = duel();
  for (const tile of map.tiles) if (tile.y !== 5) tile.blocked = true;
  const friend = state.units[1];
  friend.x = 6;
  friend.y = 5;
  b.x = 8;
  b.y = 5;
  assert.equal(findPath(state, a.id, friend, map), null);
  assert.deepEqual(findPath(state, a.id, { x: 7, y: 5 }, map), [
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ]);
  assert.equal(findPath(state, a.id, { x: 9, y: 5 }, map), null);
});

test('建筑、水、悬崖及手工 blocked 森林均不可进入；只走四邻格', () => {
  const { state, map, a } = duel();
  setTerrain(map, 5, 4, 'building');
  setTerrain(map, 4, 5, 'water');
  setTerrain(map, 5, 6, 'cliff');
  setTerrain(map, 6, 5, 'forest', true);
  assert.equal(movementRange(state, a.id, map).length, 1);
  assert.equal(findPath(state, a.id, { x: 4, y: 4 }, map), null);
});

test('剑克斧、斧克枪、枪克剑的正反方向均成立；弓不参与三角', () => {
  for (const [a, b] of [
    ['sword', 'axe'],
    ['axe', 'spear'],
    ['spear', 'sword'],
  ] as const) {
    assert.equal(weaponAdvantage(a, b), 1);
    assert.equal(weaponAdvantage(b, a), -1);
    assert.equal(weaponAdvantage(a, a), 0);
  }
  assert.equal(weaponAdvantage('bow', 'sword'), 0);
  assert.equal(weaponAdvantage('axe', 'support'), 0);
  const { state, map, a, b } = duel();
  b.weaponId = 'chief_axe';
  const neutral = forecast(state, a.id, b.id, map);
  assert.equal(neutral.attacker.advantage, 1);
  assert.equal(neutral.attacker.damage, a.stats.str + WEAPONS[a.weaponId].might + 1 - b.stats.def);
});

test('重量仅在超过体格时降低攻速，攻速下限为0', () => {
  const { a } = duel();
  a.weaponId = 'green_dragon';
  a.stats.con = 7;
  a.stats.spd = 6;
  assert.equal(attackSpeed(a), 3);
  a.stats.spd = 1;
  assert.equal(attackSpeed(a), 0);
  a.stats.con = 99;
  assert.equal(attackSpeed(a), 1);
});

test('预测不消耗随机数或修改位置，预移动取消不扣资源', () => {
  const { state, map, a, b } = duel();
  const before = JSON.stringify(state);
  movementRange(state, a.id, map);
  findPath(state, a.id, { x: 6, y: 4 }, map);
  for (let i = 0; i < 10; i++) forecast(state, a.id, b.id, map, { x: 6, y: 4 });
  assert.equal(JSON.stringify(state), before);
});

test('0命中总是回避，命中失败不消耗暴击随机数', () => {
  const { state, map, a, b } = duel(9);
  a.stats.skl = 0;
  a.stats.luk = 0;
  a.stats.spd = 1;
  b.stats.spd = 100;
  b.stats.con = 100;
  b.weaponId = 'training_bow';
  assert.equal(forecast(state, a.id, b.id, map).attacker.hit, 0);
  const result = attack(state, map);
  const hits = result.events.filter((e) => e.type === 'attack');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].hit, false);
  assert.equal(hits[0].damage, 0);
  let random = state.rngState;
  random ^= random << 13;
  random ^= random >>> 17;
  random ^= random << 5;
  assert.equal(result.state.rngState, random >>> 0);
  assert.equal(result.state.units[3].hp, b.hp);
});

test('100命中必定命中，伤害下限为0且不产生额外格挡概率', () => {
  const { state, map, a, b } = duel();
  a.stats.skl = 100;
  a.stats.spd = b.stats.spd;
  b.stats.luk = 100;
  b.stats.def = 999;
  b.weaponId = 'training_bow';
  const p = forecast(state, a.id, b.id, map);
  assert.equal(p.attacker.hit, 100);
  assert.equal(p.attacker.damage, 0);
  const events = attack(state, map).events.filter((e) => e.type === 'attack');
  assert.equal(events.length, 1);
  assert.equal(events[0].hit, true);
  assert.equal(events[0].damage, 0);
});

test('暴击使用三倍最终伤害，先手击败立刻停止反击和追击', () => {
  const { state, map, a, b } = duel();
  a.stats.skl = 250;
  a.stats.spd = 15;
  b.hp = 1;
  const prediction = forecast(state, a.id, b.id, map);
  assert.equal(prediction.attacker.crit, 100);
  assert.equal(prediction.attacker.attacks, 2);
  const result = attack(state, map);
  const hits = result.events.filter((e) => e.type === 'attack');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].critical, true);
  assert.equal(hits[0].damage, prediction.attacker.damage * 3);
  assert.equal(result.state.units[3].alive, false);
  assert.equal(result.state.units[0].exp, 30);
});

test('追击门槛是攻速差4，双股剑外观不额外增加次数', () => {
  const { state, map, a, b } = duel();
  a.stats.spd = b.stats.spd + 3;
  assert.deepEqual(forecast(state, a.id, b.id, map).order, [a.id, b.id]);
  a.stats.spd += 1;
  assert.deepEqual(forecast(state, a.id, b.id, map).order, [a.id, b.id, a.id]);
  a.stats.spd = b.stats.spd - 4;
  assert.deepEqual(forecast(state, a.id, b.id, map).order, [a.id, b.id, b.id]);
});

test('弓只在距离2攻击；贴身无反击且不能因高速追击', () => {
  const { state, map, a, b } = duel();
  b.weaponId = 'training_bow';
  b.stats.spd = 99;
  const adjacent = forecast(state, a.id, b.id, map);
  assert.equal(adjacent.defender.canAttack, false);
  assert.equal(adjacent.defender.attacks, 0);
  assert.deepEqual(adjacent.order, [a.id]);
  state.phase = 'enemy';
  assert.throws(() => attack(state, map, b.id, a.id), /射程/);
  b.x += 1;
  const distant = forecast(state, b.id, a.id, map);
  assert.equal(distant.legal, true);
  assert.equal(distant.defender.canAttack, false);
});

test('林地防御和回避同时进入预测；关羽与张飞被动按半血边界生效', () => {
  const { state, map, b } = duel();
  const guan = state.units[1];
  guan.x = 5;
  guan.y = 4;
  b.x = 6;
  b.y = 4;
  const base = forecast(state, guan.id, b.id, map);
  setTerrain(map, b.x, b.y, 'forest');
  const forest = forecast(state, guan.id, b.id, map);
  assert.equal(forest.attacker.damage, base.attacker.damage - 1);
  assert.equal(forest.attacker.hit, base.attacker.hit - 15);
  guan.hp = guan.stats.hp / 2;
  assert.equal(forecast(state, guan.id, b.id, map).attacker.hit, forest.attacker.hit);
  guan.hp -= 1;
  assert.equal(forecast(state, guan.id, b.id, map).attacker.hit, forest.attacker.hit - 5);
  const zhang = state.units[2];
  zhang.x = 6;
  zhang.y = 3;
  const normalDamage = forecast(state, zhang.id, b.id, map).attacker.damage;
  zhang.hp = zhang.stats.hp / 2;
  assert.equal(forecast(state, zhang.id, b.id, map).attacker.damage, normalDamage + 2);
});

test('非法行动原子拒绝，合法行动后不能第二次移动或重复结算', () => {
  const { state, map, a } = duel();
  const before = JSON.stringify(state);
  assert.throws(() => commitAction(state, { type: 'wait', unitId: a.id, to: { x: -1, y: 5 } }, map));
  assert.equal(JSON.stringify(state), before);
  const result = commitAction(state, { type: 'wait', unitId: a.id, to: { x: 5, y: 4 } }, map);
  assert.equal(state.units[0].acted, false);
  assert.equal(result.state.units[0].acted, true);
  assert.throws(
    () => commitAction(result.state, { type: 'wait', unitId: a.id, to: { x: 5, y: 5 } }, map),
    /不能行动/,
  );
});

test('伤药只对自己恢复10点并受最大HP限制，扣一次道具与行动', () => {
  const { state, map, a } = duel();
  a.hp = a.stats.hp - 4;
  const result = commitAction(state, { type: 'heal', unitId: a.id, to: a }, map);
  assert.equal(result.state.units[0].hp, a.stats.hp);
  assert.equal(result.state.units[0].potions, 2);
  assert.equal(result.state.units[0].acted, true);
  assert.equal(result.state.rngState, state.rngState);
  a.hp = a.stats.hp;
  assert.throws(() => commitAction(state, { type: 'heal', unitId: a.id, to: a }, map), /已满/);
  a.hp--;
  a.potions = 0;
  assert.throws(() => commitAction(state, { type: 'heal', unitId: a.id, to: a }, map), /用尽/);
});

test('参与交战只奖一次经验，升级使用保存的随机系统且HP同步成长', () => {
  const { state, map, a, b } = duel(1);
  a.exp = 95;
  a.stats.skl = 100;
  a.stats.spd = 10;
  b.hp = b.stats.hp = 100;
  b.stats.def = 90;
  b.weaponId = 'training_bow';
  const result = attack(state, map);
  const expEvents = result.events.filter((e) => e.type === 'experience');
  assert.equal(expEvents.length, 1);
  assert.equal(expEvents[0].amount, 10);
  assert.equal(result.state.units[0].exp, 5);
  assert.equal(result.state.units[0].level, 2);
  const level = result.events.find((e) => e.type === 'levelup');
  assert.ok(level);
  assert.equal(result.state.units[0].hp - a.hp, level.gains.hp ?? 0);
});

test('没有反击能力的我方未参与攻击，不获得交战经验', () => {
  const { state, map, a, b } = duel();
  state.phase = 'enemy';
  a.weaponId = 'training_bow';
  const result = attack(state, map, b.id, a.id);
  assert.equal(result.state.units[0].exp, 0);
});

test('阶段按阵营重置；所有敌人无路仍待机并进入下一回合；仁德不治疗自己', () => {
  const { state, map, a } = duel();
  const guan = state.units[1];
  guan.x = a.x;
  guan.y = a.y + 1;
  guan.hp -= 3;
  a.hp -= 4;
  for (const enemy of state.units.filter((u) => u.faction === 'enemy')) {
    enemy.x = 10 + (Number(enemy.id.replace(/\D/g, '') || 6) % 3) * 2;
    enemy.y = 2 + Math.floor(Number(enemy.id.replace(/\D/g, '') || 6) / 3) * 3;
    for (const tile of map.tiles) if (distance(enemy, tile) === 1) tile.blocked = true;
  }
  let current = endPlayerPhase(state, map).state;
  assert.equal(current.phase, 'enemy');
  assert.equal(current.units[0].acted, true);
  let steps = 0;
  while (current.phase !== 'player' && steps++ < 10) current = nextEnemyAction(current, map).state;
  assert.equal(steps, 6);
  assert.equal(current.turn, 2);
  assert.equal(current.phase, 'player');
  assert.equal(current.units[0].hp, a.hp);
  assert.equal(current.units[1].hp, guan.hp + 2);
  assert.equal(current.units[0].acted, false);
  assert.equal(
    current.units.filter((u) => u.faction === 'enemy').every((u) => u.acted),
    true,
  );
});

test('AI行动符合可达路径与射程，重复评分不耗随机且同分稳定', () => {
  const { state, map, b } = duel();
  state.phase = 'enemy';
  const before = state.rngState;
  const one = chooseAIAction(state, b.id, map);
  const two = chooseAIAction(state, b.id, map);
  assert.deepEqual(one, two);
  assert.equal(state.rngState, before);
  assert.ok(findPath(state, b.id, one.to, map));
  if (one.type === 'attack') assert.equal(forecast(state, b.id, one.targetId!, map, one.to).legal, true);
  const result = nextEnemyAction(state, map);
  assert.equal(result.state.units.filter((u) => u.faction === 'enemy' && u.acted).length, 1);
});

test('AI优先可击败目标；靠近沿可行路径而不是穿墙', () => {
  const { state, map, a, b } = duel();
  state.phase = 'enemy';
  a.hp = 1;
  const guan = state.units[1];
  guan.x = b.x;
  guan.y = b.y + 1;
  assert.equal(chooseAIAction(state, b.id, map).targetId, a.id);
  a.hp = a.stats.hp;
  a.x = 2;
  a.y = 5;
  guan.x = 1;
  guan.y = 2;
  b.x = 10;
  b.y = 5;
  for (let y = 0; y < 10; y++) setTerrain(map, 7, y, 'building');
  const action = chooseAIAction(state, b.id, map);
  assert.equal(action.type, 'wait');
  const path = findPath(state, b.id, action.to, map)!;
  assert.ok(path.length > 1);
  assert.ok(path.every((p) => p.x !== 7 || p.y >= 10));
});

test('敌方威胁格基于移动和射程，不包含不可站立地形', () => {
  const { state, map } = duel();
  setTerrain(map, 6, 4, 'water');
  const threat = enemyThreat(state, map);
  assert.ok(threat.length > 0);
  assert.ok(!threat.some((p) => p.x === 6 && p.y === 4));
});

test('固定种子与指令完全复现，保存恢复后战斗结果一致', () => {
  const { state, map } = duel();
  const recovered = restore(serialize(state), map);
  assert.deepEqual(attack(state, map), attack(recovered, map));
  assert.deepEqual(attack(state, map), attack(state, map));
});

test('只允许稳定我方或结算保存，损坏和版本错误存档被拒绝', () => {
  const { state, map } = duel();
  assert.throws(() => serialize(endPlayerPhase(state, map).state), /我方/);
  assert.throws(() => restore('{broken', map), /原数据已保留/);
  const envelope = JSON.parse(serialize(state));
  envelope.version = 999;
  assert.throws(() => restore(JSON.stringify(envelope), map), /版本/);
  envelope.version = 1;
  envelope.state.units[0].x = -1;
  assert.throws(() => restore(JSON.stringify(envelope), map), /不完整/);
  envelope.state.units[0].x = 5;
  envelope.state.rngState = 0;
  assert.throws(() => restore(JSON.stringify(envelope), map), /不完整/);
});

test('三兄弟任一败退立即失败，终局禁止新行动与AI', () => {
  const { state, map, a, b } = duel();
  state.phase = 'enemy';
  a.hp = 1;
  b.stats.skl = 250;
  const result = attack(state, map, b.id, a.id);
  assert.equal(result.state.status, 'defeat');
  assert.deepEqual(nextEnemyAction(result.state, map).events, []);
  assert.throws(() => attack(result.state, map), /已经结束/);
});

test('全敌军败退才胜利，简雍胜利剧情后加入一次，读档不重复奖励', () => {
  const { state, map, a, b } = duel();
  for (const enemy of state.units.filter((u) => u.faction === 'enemy' && u.id !== b.id)) {
    enemy.alive = false;
    enemy.hp = 0;
  }
  a.stats.skl = 250;
  b.hp = 1;
  const victory = attack(state, map).state;
  assert.equal(victory.status, 'victory');
  assert.equal(victory.roster.includes('jian_yong'), false);
  const completed = completeVictory(victory);
  assert.equal(completed.state.status, 'complete');
  assert.equal(completed.events.length, 1);
  const recovered = restore(serialize(completed.state), map);
  const duplicate = completeVictory(recovered);
  assert.equal(duplicate.events.length, 0);
  assert.equal(duplicate.state.roster.filter((id) => id === 'jian_yong').length, 1);
  assert.equal(duplicate.state.units[0].exp, victory.units[0].exp);
});
