import type { GameEvent, GameState } from '../core/types';
import { animationDuration, type ArtAssets, type BattleAnimation, type UnitVisual } from '../render';

/** 只播放已经提交的规则事件，不写入游戏状态或抽取随机数。 */
export async function playEvents(
  before: GameState,
  events: GameEvent[],
  art: ArtAssets,
  publish: (animation: BattleAnimation) => void,
  caption: (text: string) => void,
  speed: () => number,
  active: () => boolean,
): Promise<void> {
  const units: Record<string, UnitVisual> = {};
  before.units.forEach((unit) => {
    units[unit.id] = { x: unit.x, y: unit.y, hp: unit.hp, visible: unit.alive, facing: unit.facing };
  });
  const byId = (id: string) => before.units.find((unit) => unit.id === id)!;
  const frame = (duration: number, draw: (elapsed: number, progress: number) => BattleAnimation) =>
    new Promise<void>((resolve) => {
      let elapsed = 0,
        last = performance.now();
      const tick = (now: number) => {
        if (!active()) {
          resolve();
          return;
        }
        elapsed = Math.min(duration, elapsed + (now - last) * speed());
        last = now;
        publish({ units, ...draw(elapsed, elapsed / duration) });
        if (elapsed >= duration) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  for (const event of events) {
    if (!active()) return;
    if (event.type === 'move') {
      const visual = units[event.unitId],
        unit = byId(event.unitId);
      caption(`${unit.name} 行军`);
      for (let index = 1; index < event.path.length; index++) {
        const start = event.path[index - 1],
          end = event.path[index];
        if (end.x !== start.x) visual.facing = end.x > start.x ? 1 : -1;
        await frame(175, (time, progress) => {
          Object.assign(visual, {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
            state: 'move',
            timeMs: time + index * 175,
          });
          return {};
        });
      }
      visual.state = 'idle';
      visual.timeMs = 0;
    } else if (event.type === 'attack') {
      const actor = units[event.unitId],
        target = units[event.targetId];
      const dx = target.x! - actor.x!;
      if (dx) {
        actor.facing = dx > 0 ? 1 : -1;
        target.facing = dx > 0 ? -1 : 1;
      }
      const total = animationDuration(art, byId(event.unitId).renderClassId, 'attack');
      const impact = Math.floor(total * 0.42);
      caption(
        `${byId(event.unitId).name} → ${byId(event.targetId).name} · ${event.hit ? (event.critical ? '暴击' : `伤害 ${event.damage}`) : '回避'}`,
      );
      await frame(total + 260, (time, progress) => {
        actor.state = 'attack';
        actor.timeMs = Math.min(time, total - 1);
        target.state = time >= impact ? (event.hit ? 'hit' : 'dodge') : 'idle';
        target.timeMs = Math.max(0, time - impact);
        if (time >= impact) target.hp = event.hpAfter;
        return {
          effects:
            time >= impact && event.hit
              ? [
                  {
                    id: event.critical ? 'advantage' : 'legacy_slash',
                    x: target.x!,
                    y: target.y!,
                    timeMs: time - impact,
                  },
                ]
              : [],
          floats:
            time >= impact
              ? [
                  {
                    x: target.x!,
                    y: target.y!,
                    text: event.hit ? `${event.critical ? '暴击 ' : ''}−${event.damage}` : '回避',
                    color: event.hit ? '#fff0cf' : '#9acded',
                    progress,
                  },
                ]
              : [],
        };
      });
      actor.state = 'idle';
      target.state = 'idle';
      actor.timeMs = 0;
      target.timeMs = 0;
    } else if (event.type === 'heal') {
      const visual = units[event.unitId];
      caption(`${byId(event.unitId).name} 恢复 ${event.amount} 点生命`);
      await frame(720, (time, progress) => {
        Object.assign(visual, { state: 'heal', timeMs: time, hp: event.hpAfter });
        return {
          effects: [{ id: 'legacy_heal', x: visual.x!, y: visual.y!, timeMs: time }],
          floats: [{ x: visual.x!, y: visual.y!, text: `+${event.amount}`, color: '#c1f0aa', progress }],
        };
      });
      visual.state = 'idle';
      visual.timeMs = 0;
    } else if (event.type === 'defeat') {
      const visual = units[event.unitId];
      caption(`${byId(event.unitId).name} 败退`);
      await frame(660, (time, progress) => {
        Object.assign(visual, {
          state: 'defeat',
          timeMs: time,
          opacity: 1 - Math.max(0, progress - 0.5) * 2,
        });
        return { effects: [{ id: 'defeat_light', x: visual.x!, y: visual.y!, timeMs: time }] };
      });
      visual.visible = false;
    } else if (event.type === 'levelup') {
      const visual = units[event.unitId];
      caption(`${byId(event.unitId).name} 升至 ${event.level} 级`);
      await frame(850, (time, progress) => ({
        effects: [{ id: 'level_up', x: visual.x!, y: visual.y!, timeMs: time }],
        floats: [{ x: visual.x!, y: visual.y!, text: `等级提升 ${event.level}`, progress }],
      }));
    } else if (event.type === 'phase') {
      caption(
        `第 ${event.turn} 回合 · ${event.phase === 'player' ? '我方' : event.phase === 'ally' ? '友军' : '敌军'}阶段`,
      );
      await frame(380, () => ({}));
    } else if (event.type === 'wait') {
      caption(`${byId(event.unitId).name} 待机`);
      await frame(120, () => ({}));
    }
  }
  publish({});
}
