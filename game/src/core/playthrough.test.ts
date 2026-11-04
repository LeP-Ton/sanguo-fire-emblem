import test from 'node:test';
import assert from 'node:assert/strict';
import chapter from '../data/chapter1.json';
import {
  chooseAIAction,
  commitAction,
  completeVictory,
  createBattle,
  endPlayerPhase,
  nextEnemyAction,
  restore,
  serialize,
} from './engine';
import { RULES } from '../data/gameplay';
import type { Action, GameState, MapData } from './types';

const map = chapter as MapData;

/** 与 UI 使用同样的合法指令；不修改HP、随机数或敌人状态。 */
function play(seed: number, passive: boolean) {
  let state = createBattle(seed, map);
  const actions: Array<{ turn: number; action: Action }> = [];
  while (state.status === 'battle' && state.turn <= 30) {
    if (state.phase === 'player') {
      assert.deepEqual(restore(serialize(state), map), state);
      for (const unitId of ['liu_bei', 'guan_yu', 'zhang_fei']) {
        const unit = state.units.find((u) => u.id === unitId)!;
        if (!unit.alive || unit.acted || state.status !== 'battle') continue;
        const action: Action = passive
          ? { type: 'wait', unitId, to: { x: unit.x, y: unit.y } }
          : unit.hp <= unit.stats.hp - 10 && unit.potions > 0
            ? { type: 'heal', unitId, to: { x: unit.x, y: unit.y } }
            : chooseAIAction(state, unitId, map);
        actions.push({ turn: state.turn, action });
        state = commitAction(state, action, map).state;
      }
      if (state.status === 'battle') state = endPlayerPhase(state, map).state;
    } else state = nextEnemyAction(state, map).state;
  }
  return { state, actions };
}

test('真实首关地图：默认种子经合法移动、交战与伤药可通关，存读档一致', () => {
  const result = play(RULES.defaultSeed, false);
  assert.equal(
    result.state.status,
    'victory',
    `第 ${result.state.turn} 回合 ${result.state.status}：${JSON.stringify(result.actions)}`,
  );
  const complete = completeVictory(result.state).state;
  assert.equal(complete.status, 'complete');
  assert.ok(complete.roster.includes('jian_yong'));
  assert.deepEqual(restore(serialize(complete), map), complete);
});

test('真实首关地图：持续待机可触发失败，重新开局恢复初始状态与种子', () => {
  const { state } = play(RULES.defaultSeed, true);
  assert.equal(state.status, 'defeat');
  const retry: GameState = createBattle(state.seed, map);
  assert.equal(retry.turn, 1);
  assert.equal(retry.status, 'battle');
  assert.ok(retry.units.every((u) => u.alive && !u.acted && u.hp === u.stats.hp));
  assert.equal(retry.rngState, RULES.defaultSeed);
});
