import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  createBattle,
  movementRange,
  findPath,
  forecast,
  commitAction,
  endPlayerPhase,
  nextEnemyAction,
  enemyThreat,
  terrainAt,
  completeVictory,
  serialize,
  restore,
} from '../core';
import type { Action, ActionResult, CombatSide, GameState, MapData, Position, Unit } from '../core/types';
import { RULES, TERRAINS, WEAPONS, SKILLS } from '../data/gameplay';
import mapJson from '../data/chapter1.json';
import { openingDialogue, victoryDialogue, type DialogueLine } from '../data/content';
import {
  assetUrl,
  loadArt,
  drawBattle,
  drawUnitPreview,
  animationDuration,
  type ArtAssets,
  type BattleView,
  type BattleAnimation,
  type AnimationName,
} from '../render';
import { playEvents } from './animation';

const map = mapJson as MapData;
const SAVE_KEY = 'sanguo-fire-emblem.save.v1';
const SETTINGS_KEY = 'sanguo-fire-emblem.settings.v1';
const READ_KEY = 'sanguo-fire-emblem.read.v1';
type Scene = 'title' | 'opening' | 'battle' | 'victoryStory' | 'result';
type Mode = 'idle' | 'selected' | 'menu' | 'target' | 'forecast';
const familyNames: Record<string, string> = {
  sword: '剑',
  axe: '刀斧',
  spear: '枪',
  bow: '弓',
  strategy: '计策',
  support: '辅助',
};
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const distance = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const readLocal = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
function readSettings() {
  try {
    const parsed = JSON.parse(readLocal(SETTINGS_KEY) || '{}');
    return {
      speed: [1, 2, 4].includes(parsed.speed) ? parsed.speed : 1,
      grid: parsed.grid !== false,
      threat: parsed.threat === true,
    };
  } catch {
    return { speed: 1, grid: true, threat: false };
  }
}

export default function App() {
  const [art, setArt] = useState<ArtAssets | null>(null);
  const [progress, setProgress] = useState([0, 1]);
  const [loadError, setLoadError] = useState('');
  const [scene, setScene] = useState<Scene>('title');
  const [game, setGame] = useState<GameState>(() => createBattle(RULES.defaultSeed, map));
  const [settings, setSettings] = useState(readSettings);
  const [cursor, setCursor] = useState<Position>({ x: 5, y: 4 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Position | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState('选择一名武将，开始行军。');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'help' | 'settings' | null>(null);
  const [saved, setSaved] = useState(Boolean(readLocal(SAVE_KEY)));
  const [seed, setSeed] = useState(String(RULES.defaultSeed));
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [textCount, setTextCount] = useState(0);
  const [readStories, setReadStories] = useState<string[]>(() => {
    try {
      const value = JSON.parse(readLocal(READ_KEY) || '[]');
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const gameRef = useRef(game),
    busyRef = useRef(false),
    speedRef = useRef(settings.speed);
  const animationRef = useRef<BattleAnimation>({}),
    mountedRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement>(null),
    viewRef = useRef<BattleView | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const inspection = new URLSearchParams(location.search).has('inspect');

  useEffect(() => {
    mountedRef.current = true;
    let ignored = false;
    loadArt((loaded, total) => {
      if (!ignored) setProgress([loaded, total]);
    })
      .then((value) => {
        if (!ignored) setArt(value);
      })
      .catch((error) => {
        if (!ignored) setLoadError(String(error));
      });
    return () => {
      ignored = true;
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [scene]);
  useEffect(() => {
    speedRef.current = settings.speed;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 存储受限仍允许本局游玩。 */
    }
  }, [settings]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (mode === 'menu' || mode === 'forecast')
      actionRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [mode]);

  const selected = game.units.find((unit) => unit.id === selectedId);
  const hovered = game.units.find((unit) => unit.alive && same(unit, cursor));
  const inspected = selected || hovered;
  const selectable =
    selected?.faction === 'player' && !selected.acted && selected.alive && game.phase === 'player' && !busy;
  const range = useMemo(
    () => (selectable && selectedId ? movementRange(game, selectedId, map) : []),
    [game, selectedId, selectable],
  );
  const path = selectedId && mode === 'selected' ? range.find((tile) => same(tile, cursor))?.path || [] : [];
  const attackFrom = preview || selected;
  const targets =
    selectable && attackFrom
      ? game.units.filter(
          (unit) =>
            unit.alive &&
            unit.faction === 'enemy' &&
            distance(unit, attackFrom) >= WEAPONS[selected.weaponId].minRange &&
            distance(unit, attackFrom) <= WEAPONS[selected.weaponId].maxRange,
        )
      : [];
  const attackCells =
    attackFrom && ['menu', 'target', 'forecast'].includes(mode)
      ? map.tiles.filter((tile) => distance(tile, attackFrom) === 1)
      : [];
  const threat = useMemo(
    () => (settings.threat && scene === 'battle' ? enemyThreat(game, map) : []),
    [settings.threat, game, scene],
  );
  const prediction =
    selectedId && targetId && mode === 'forecast'
      ? forecast(game, selectedId, targetId, map, preview || undefined)
      : null;
  const tile = map.tiles.find((cell) => same(cell, cursor))!;
  const terrain = TERRAINS[terrainAt(map, cursor)];
  const playerUnits = game.units.filter((unit) => unit.faction === 'player');
  const enemies = game.units.filter((unit) => unit.faction === 'enemy' && unit.alive);
  const dialogue: DialogueLine[] = scene === 'victoryStory' ? victoryDialogue : openingDialogue;
  const line = dialogue[dialogueIndex];
  const isDialogue = scene === 'opening' || scene === 'victoryStory';

  viewRef.current = {
    state: game,
    map,
    cursor: busy ? undefined : cursor,
    selectedId: busy ? null : selectedId,
    previewPosition: preview,
    grid: settings.grid,
    threat: busy ? [] : threat,
    moveCells: mode === 'selected' ? range : [],
    attackCells: busy ? [] : attackCells,
    path,
  };
  useEffect(() => {
    if (!art || scene !== 'battle') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(1024 * dpr);
      canvas.height = Math.round(768 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener('resize', resize);
    const paint = (time: number) => {
      if (viewRef.current)
        drawBattle(ctx, art, { ...viewRef.current, animation: animationRef.current }, time);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [art, scene]);

  useEffect(() => {
    if (!isDialogue || !line) return;
    setTextCount(0);
    const timer = window.setInterval(
      () => setTextCount((count) => Math.min(line.text.length, count + 1)),
      30,
    );
    return () => clearInterval(timer);
  }, [scene, dialogueIndex, isDialogue, line]);

  function resetSelection() {
    setSelectedId(null);
    setPreview(null);
    setTargetId(null);
    setMode('idle');
  }
  function updateGame(next: GameState) {
    gameRef.current = next;
    setGame(next);
  }
  function saveState(value: GameState, silent = false) {
    try {
      localStorage.setItem(SAVE_KEY, serialize(value));
      setSaved(true);
      if (!silent) setNotice('进度已保存。随机数状态与队伍一并保留。');
    } catch (error) {
      setNotice(`保存失败：${error instanceof Error ? error.message : error}`);
    }
  }
  function startNew() {
    if (busyRef.current) return;
    const seedValue = Number(seed);
    if (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 0xffffffff) {
      setNotice('随机种子须为 0 至 4294967295 的整数。');
      return;
    }
    updateGame(createBattle(seedValue, map));
    resetSelection();
    setCursor({ x: 5, y: 4 });
    setDialogueIndex(0);
    setTextCount(0);
    setScene('opening');
    setNotice('');
  }
  function continueGame() {
    try {
      const next = restore(readLocal(SAVE_KEY) || '', map);
      updateGame(next);
      resetSelection();
      setNotice('存档已恢复。');
      setDialogueIndex(0);
      setScene(
        next.status === 'complete' || next.status === 'defeat'
          ? 'result'
          : next.status === 'victory'
            ? 'victoryStory'
            : 'battle',
      );
    } catch (error) {
      setNotice(`存档无法读取，原始数据已保留。${error instanceof Error ? error.message : error}`);
    }
  }
  function retry() {
    updateGame(createBattle(gameRef.current.seed, map));
    resetSelection();
    setCursor({ x: 5, y: 4 });
    setCaption('重新集结。选择武将开始行动。');
    setScene('battle');
  }
  function finishDialogue() {
    const read = [...new Set([...readStories, scene])];
    setReadStories(read);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(read));
    } catch {
      /* 已读状态仅影响跳过按钮。 */
    }
    if (scene === 'opening') {
      setScene('battle');
      setCaption('张飞的枪克制剑兵；关羽应避开剑兵围攻。');
      saveState(gameRef.current, true);
    } else {
      const next = completeVictory(gameRef.current).state;
      updateGame(next);
      saveState(next, true);
      setScene('result');
    }
  }
  function advanceDialogue() {
    if (!line) return;
    if (textCount < line.text.length) setTextCount(line.text.length);
    else if (dialogueIndex < dialogue.length - 1) setDialogueIndex((index) => index + 1);
    else finishDialogue();
  }
  function selectUnit(unit: Unit) {
    if (busyRef.current) return;
    setCursor({ x: unit.x, y: unit.y });
    setSelectedId(unit.id);
    setPreview(null);
    setTargetId(null);
    setMode(unit.faction === 'player' && !unit.acted ? 'selected' : 'idle');
    setCaption(
      unit.faction === 'enemy'
        ? '查看敌军属性，留意武器相克与威胁范围。'
        : unit.acted
          ? '该武将已经行动，等待下一回合。'
          : '蓝格为可移动落点。点击落点，或再次点击原地打开行动菜单。',
    );
  }
  function chooseCell(pos: Position) {
    if (busyRef.current || gameRef.current.status !== 'battle' || gameRef.current.phase !== 'player' || modal)
      return;
    setCursor(pos);
    const unit = game.units.find((item) => item.alive && same(item, pos));
    if (mode === 'target') {
      if (unit && targets.some((item) => item.id === unit.id)) {
        setTargetId(unit.id);
        setMode('forecast');
      } else setNotice('请选择红色范围内的敌军。');
      return;
    }
    if (mode === 'menu' || mode === 'forecast') return;
    if (mode === 'selected' && selected && selectable) {
      if (range.some((cell) => same(cell, pos))) {
        setPreview(pos);
        setMode('menu');
        setCaption('此时仍可撤销移动。攻击、伤药或待机才会消耗行动。');
        return;
      }
      if (unit && unit.id !== selectedId) {
        selectUnit(unit);
        return;
      }
      setNotice('该落点不可通行、超出范围或已被占用，请选择蓝格。');
      return;
    }
    if (unit) selectUnit(unit);
    else resetSelection();
  }
  function cancel() {
    if (busyRef.current) return;
    if (modal) {
      setModal(null);
      return;
    }
    if (mode === 'forecast') {
      setTargetId(null);
      setMode('target');
    } else if (mode === 'target') setMode('menu');
    else if (mode === 'menu') {
      setPreview(null);
      setMode('selected');
      setCaption('已撤销预移动，行动与道具未消耗。');
    } else resetSelection();
    canvasRef.current?.focus();
  }
  async function showResult(before: GameState, result: ActionResult) {
    gameRef.current = result.state;
    await playEvents(
      before,
      result.events,
      art!,
      (value) => {
        animationRef.current = value;
      },
      setCaption,
      () => speedRef.current,
      () => mountedRef.current,
    );
    if (!mountedRef.current) return;
    animationRef.current = {};
    setGame(result.state);
  }
  function settle() {
    const current = gameRef.current;
    if (current.status === 'victory') {
      setDialogueIndex(0);
      setTextCount(0);
      setScene('victoryStory');
    }
    if (current.status === 'defeat') setScene('result');
  }
  async function execute(action: Action) {
    if (busyRef.current || !art) return;
    busyRef.current = true;
    setBusy(true);
    resetSelection();
    try {
      const before = gameRef.current;
      const result = commitAction(before, action, map);
      await showResult(before, result);
      settle();
      if (result.state.status === 'battle')
        setCaption(
          result.state.units.some((unit) => unit.faction === 'player' && unit.alive && !unit.acted)
            ? '选择下一名武将，或结束我方阶段。'
            : '全员行动完毕。请结束我方阶段。',
        );
    } catch (error) {
      setNotice(String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function endTurn() {
    if (busyRef.current || gameRef.current.phase !== 'player' || gameRef.current.status !== 'battle') return;
    busyRef.current = true;
    setBusy(true);
    resetSelection();
    try {
      let before = gameRef.current;
      await showResult(before, endPlayerPhase(before, map));
      while (
        mountedRef.current &&
        gameRef.current.status === 'battle' &&
        gameRef.current.phase !== 'player'
      ) {
        before = gameRef.current;
        await showResult(before, nextEnemyAction(before, map));
      }
      settle();
      if (gameRef.current.status === 'battle') {
        setCaption(`第 ${gameRef.current.turn} 回合开始。仁德已结算，轮到我方行动。`);
        saveState(gameRef.current, true);
      }
    } catch (error) {
      setNotice(String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function canvasPosition(event: React.MouseEvent<HTMLCanvasElement>): Position {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(15, Math.floor(((event.clientX - rect.left) / rect.width) * 16))),
      y: Math.max(0, Math.min(11, Math.floor(((event.clientY - rect.top) / rect.height) * 12))),
    };
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) return;
      if (event.repeat) {
        if (event.key === 'Enter' || event.code === 'Space') event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
      }
      if (modal || busyRef.current) return;
      if (isDialogue && (event.key === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        advanceDialogue();
        return;
      }
      if (scene !== 'battle' || game.phase !== 'player') return;
      if (['menu', 'forecast'].includes(mode)) return;
      const shifts: Record<string, Position> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };
      if (shifts[event.key]) {
        event.preventDefault();
        const shift = shifts[event.key];
        setCursor((point) => ({
          x: Math.max(0, Math.min(15, point.x + shift.x)),
          y: Math.max(0, Math.min(11, point.y + shift.y)),
        }));
        canvasRef.current?.focus();
      } else if (event.key === 'Enter' && element.tagName !== 'BUTTON') {
        event.preventDefault();
        chooseCell(cursor);
      } else if (event.key.toLowerCase() === 'g') setSettings((value) => ({ ...value, grid: !value.grid }));
      else if (event.key.toLowerCase() === 't') setSettings((value) => ({ ...value, threat: !value.threat }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // 开发验收只读快照；没有跳关、改血量或替玩家提交行动的接口。
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debugWindow = window as unknown as { __sanguo?: unknown };
    debugWindow.__sanguo = {
      snapshot: () =>
        JSON.parse(
          JSON.stringify({
            game: gameRef.current,
            ui: { scene, mode, selectedId, preview, targetId, busy: busyRef.current },
            map,
          }),
        ),
    };
    return () => {
      delete debugWindow.__sanguo;
    };
  }, [scene, mode, selectedId, preview, targetId]);

  if (loadError)
    return (
      <main className="loading">
        <div className="seal">三</div>
        <h1>军资尚未备齐</h1>
        <p>{loadError}</p>
        <p>在 game 目录运行 npm run import:assets 后重试。</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </main>
    );
  if (!art)
    return (
      <main className="loading">
        <div className="seal">三</div>
        <h1>三国火纹</h1>
        <p>整备行军图与将士装备</p>
        <progress value={progress[0]} max={progress[1]} />
        <small>
          {progress[0]} / {progress[1]}
        </small>
      </main>
    );
  const panelStyle = {
    '--panel-blue': `url("${assetUrl('panel_blue')}")`,
    '--panel-red': `url("${assetUrl('panel_red')}")`,
    '--hp-fill': `url("${assetUrl('hp_fill')}")`,
    '--bar-frame': `url("${assetUrl('bar_frame')}")`,
  } as CSSProperties;
  if (inspection) return <Inspection art={art} />;

  return (
    <div
      className="app"
      style={panelStyle}
      data-qa-state={import.meta.env.DEV ? JSON.stringify(game) : undefined}
      data-scene={scene}
      data-mode={mode}
      data-busy={busy}
    >
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            if (!busyRef.current) {
              resetSelection();
              setScene('title');
            }
          }}
        >
          <span className="brand-seal">三</span>
          <span>
            三国火纹<small>逐鹿 · 一八四</small>
          </span>
        </a>
        <div className="chapter-label">
          <span>黄巾之乱</span>
          <b>第一章 · 桃园结义</b>
        </div>
        <nav>
          <button className="quiet" onClick={() => setModal('help')}>
            行军指南
          </button>
          <button className="quiet" onClick={() => setModal('settings')}>
            设置
          </button>
        </nav>
      </header>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
      {scene === 'title' && (
        <main className="title-scene" style={{ backgroundImage: `url("${assetUrl('peach_garden_day')}")` }}>
          <div className="title-shade" />
          <div className="title-copy">
            <span className="eyebrow">苍天已乱 · 英雄初起</span>
            <h1>
              三国<span>火纹</span>
            </h1>
            <div className="title-divider" />
            <p className="verse">一诺同生死，千里共山河。</p>
            <p className="title-description">
              黄巾烽起，山河动荡。
              <br />
              三位布衣于桃园立誓，故事从一座小村开始。
            </p>
            <div className="title-actions">
              <button className="primary" onClick={startNew}>
                启程 · 新的征战 <span>→</span>
              </button>
              <button onClick={continueGame} disabled={!saved}>
                继续征战 <span>{saved ? '读取军中记录' : '暂无行军记录'}</span>
              </button>
            </div>
            <small className="title-note">
              首章 · 桃园结义 <i /> 单人回合制战棋
            </small>
          </div>
          <div className="title-portraits" aria-hidden="true">
            <img className="hero guan" src={assetUrl('guan_yu_early_calm')} />
            <img className="hero zhang" src={assetUrl('zhang_fei_early_calm')} />
            <img className="hero liu" src={assetUrl('liu_bei_early_calm')} />
          </div>
          <div className="title-corner">
            义结桃园<small>卷 一</small>
          </div>
        </main>
      )}
      {isDialogue && line && (
        <main
          className="dialogue-scene"
          style={{ backgroundImage: `url("${assetUrl('peach_garden_day')}")` }}
        >
          <div className="scene-tag">{scene === 'opening' ? '序 · 桃园之誓' : '终 · 乡里得安'}</div>
          <img className="dialogue-portrait" src={assetUrl(line.portraitId)} alt={line.speaker} />
          <div className="dialogue-box panel">
            <span className="speaker">{line.speaker}</span>
            <p>
              {line.text.slice(0, textCount)}
              <span className="type-caret" />
            </p>
            <div className="dialogue-controls">
              <small>
                {dialogueIndex + 1} / {dialogue.length} · Enter 推进
              </small>
              <div>
                {readStories.includes(scene) && (
                  <button className="quiet" onClick={finishDialogue}>
                    跳过已读
                  </button>
                )}
                <button className="text-button" onClick={advanceDialogue}>
                  {textCount < line.text.length
                    ? '显示全文'
                    : dialogueIndex === dialogue.length - 1
                      ? scene === 'opening'
                        ? '出阵'
                        : '继续'
                      : '继续'}{' '}
                  <span>▸</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      )}
      {scene === 'battle' && (
        <main className="battle-layout">
          <section className="battle-main">
            <div className="battle-heading">
              <div>
                <span className={`phase-dot ${game.phase}`} />
                <b>第 {game.turn} 回合</b>
                <span className="phase-label">{game.phase === 'player' ? '我方阶段' : '敌军阶段'}</span>
              </div>
              <span>
                胜利条件 <b>击退全部敌军</b>
              </span>
              <div className="army-count">
                义军 <b>{playerUnits.filter((unit) => unit.alive).length}</b>
                <i />
                敌军 <b>{enemies.length}</b>
              </div>
            </div>
            <div className="map-wrap">
              <canvas
                ref={canvasRef}
                data-testid="battle-map"
                aria-label="村外战场，十六列十二行。方向键移动光标，回车选择。"
                tabIndex={0}
                onClick={(event) => chooseCell(canvasPosition(event))}
                onMouseMove={(event) => {
                  if (!busy) {
                    const point = canvasPosition(event);
                    if (!same(point, cursor)) setCursor(point);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cancel();
                }}
              />
              <div className="map-caption">
                <span>涿郡 · 村外</span>
                <small>春 · 晴</small>
              </div>
              {busy && (
                <div className="battle-ribbon" role="status">
                  {caption}
                </div>
              )}
              {mode === 'forecast' && prediction && (
                <div className="forecast-panel panel" ref={actionRef}>
                  <div className="forecast-title">
                    <span>交战预测</span>
                    <small>含地形与特技；受击后半血被动可能变化</small>
                  </div>
                  <div className="forecast-sides">
                    <ForecastSide side={prediction.attacker} unit={selected!} />
                    <span className="versus">对</span>
                    <ForecastSide
                      side={prediction.defender}
                      unit={game.units.find((unit) => unit.id === targetId)!}
                      enemy
                    />
                  </div>
                  <div className="forecast-actions">
                    <button
                      onClick={() => {
                        setMode('target');
                        setTargetId(null);
                      }}
                    >
                      返回选敌
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        execute({
                          type: 'attack',
                          unitId: selectedId!,
                          to: preview || selected!,
                          targetId: targetId!,
                        })
                      }
                    >
                      确认交战
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="map-footer">
              <span>{caption}</span>
              <small>
                <kbd>方向键</kbd> 移动 <kbd>Enter</kbd> 确认 <kbd>Esc</kbd> 取消
              </small>
            </div>
            <div className="battle-tools">
              <label>
                <input
                  type="checkbox"
                  checked={settings.grid}
                  onChange={(event) => setSettings((value) => ({ ...value, grid: event.target.checked }))}
                />{' '}
                网格 <kbd>G</kbd>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.threat}
                  onChange={(event) => setSettings((value) => ({ ...value, threat: event.target.checked }))}
                />{' '}
                敌方威胁 <kbd>T</kbd>
              </label>
              <label className="speed-control">
                战斗速度{' '}
                <select
                  aria-label="战斗速度"
                  value={settings.speed}
                  onChange={(event) =>
                    setSettings((value) => ({ ...value, speed: Number(event.target.value) }))
                  }
                >
                  <option value={1}>正常</option>
                  <option value={2}>2 倍</option>
                  <option value={4}>4 倍</option>
                </select>
              </label>
              <button
                className="quiet"
                disabled={busy || Boolean(preview) || game.phase !== 'player'}
                onClick={() => saveState(gameRef.current)}
              >
                保存进度
              </button>
            </div>
          </section>
          <aside className="battle-sidebar">
            <div className="objective">
              <span className="eyebrow">军令</span>
              <h2>守住这一方乡土</h2>
              <p>
                击退黄巾散兵与头目。
                <br />
                三兄弟任意一人败退即告失败。
              </p>
            </div>
            <div className="unit-panel panel">
              {inspected ? (
                <>
                  <div className="unit-heading">
                    <img src={assetUrl(inspected.avatarId)} alt="" />
                    <div>
                      <span className={inspected.faction === 'enemy' ? 'enemy-text' : 'blue-text'}>
                        {inspected.className}
                      </span>
                      <h2>
                        {inspected.name}
                        <small>Lv.{inspected.level}</small>
                      </h2>
                    </div>
                  </div>
                  <div className="hp-title">
                    <span>生命</span>
                    <b>
                      {inspected.hp} <small>/ {inspected.stats.hp}</small>
                    </b>
                  </div>
                  <div className="hp-track">
                    <span style={{ width: `${(100 * inspected.hp) / inspected.stats.hp}%` }} />
                  </div>
                  <div className="weapon-row">
                    <img src={assetUrl(WEAPONS[inspected.weaponId].artWeaponId)} alt="" />
                    <div>
                      <b>{WEAPONS[inspected.weaponId].name}</b>
                      <small>
                        {familyNames[WEAPONS[inspected.weaponId].combatFamily]} · 射程{' '}
                        {WEAPONS[inspected.weaponId].minRange} · 无耐久消耗
                      </small>
                    </div>
                  </div>
                  <div className="stats-grid">
                    {[
                      ['力量', inspected.stats.str],
                      ['技巧', inspected.stats.skl],
                      ['速度', inspected.stats.spd],
                      ['防御', inspected.stats.def],
                      ['幸运', inspected.stats.luk],
                      ['移动', inspected.stats.mov],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                  {inspected.skillId && (
                    <div className="skill">
                      <b>{SKILLS[inspected.skillId].name}</b>
                      <p>{SKILLS[inspected.skillId].description}</p>
                    </div>
                  )}
                  <div className="unit-foot">
                    <span>
                      <img className="experience-icon" src={assetUrl('icon_experience')} alt="" />
                      经验 {inspected.exp}/100
                    </span>
                    <span>伤药 ×{inspected.potions}</span>
                  </div>
                </>
              ) : (
                <div className="no-selection">
                  <span className="small-seal">将</span>
                  <h2>三人同心</h2>
                  <p>
                    选择地图上的武将
                    <br />
                    查看属性与行动范围
                  </p>
                </div>
              )}
            </div>
            {mode === 'menu' && selected && (
              <div className="action-panel panel" ref={actionRef}>
                <span className="section-label">{selected.name} · 行动</span>
                <button
                  className="primary"
                  disabled={!targets.length}
                  onClick={() => {
                    setMode('target');
                    canvasRef.current?.focus();
                    setCaption('选择红格内敌军，查看交战预测。');
                  }}
                >
                  攻击 <small>{targets.length ? `${targets.length} 个目标` : '没有相邻敌军'}</small>
                </button>
                <button
                  disabled={!selected.potions || selected.hp >= selected.stats.hp}
                  onClick={() => execute({ type: 'heal', unitId: selected.id, to: preview || selected })}
                >
                  使用伤药 <small>恢复 10 HP</small>
                </button>
                <button
                  onClick={() => execute({ type: 'wait', unitId: selected.id, to: preview || selected })}
                >
                  待机 <small>完成行动</small>
                </button>
                <button className="quiet" onClick={cancel}>
                  撤销移动
                </button>
              </div>
            )}
            {mode === 'target' && (
              <div className="target-panel panel">
                <span className="section-label">选择攻击目标</span>
                {targets.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => {
                      setTargetId(unit.id);
                      setMode('forecast');
                    }}
                  >
                    {unit.name} <small>{unit.hp} HP</small>
                  </button>
                ))}
                <button className="quiet" onClick={cancel}>
                  返回行动
                </button>
              </div>
            )}
            <div className="terrain-panel">
              <div>
                <span className="terrain-symbol">{terrain.name.slice(0, 1)}</span>
                <div>
                  <b>
                    {terrain.name}
                    {tile?.blocked && terrain.cost !== null ? ' · 遮挡' : ''}
                  </b>
                  <small>
                    坐标 {cursor.x}, {cursor.y}
                  </small>
                </div>
              </div>
              <p>
                <span>
                  移动 <b>{tile?.blocked || terrain.cost === null ? '不可通行' : terrain.cost}</b>
                </span>
                <span>
                  防御 <b>+{terrain.defense}</b>
                </span>
                <span>
                  回避 <b>+{terrain.avoid}</b>
                </span>
              </p>
            </div>
            <div className="roster">
              <span className="section-label">出阵武将</span>
              {playerUnits.map((unit) => (
                <button
                  key={unit.id}
                  data-unit-id={unit.id}
                  className={`${selectedId === unit.id ? 'active' : ''} ${unit.acted ? 'acted' : ''}`}
                  disabled={busy || !unit.alive || Boolean(preview)}
                  onClick={() => selectUnit(unit)}
                >
                  <img src={assetUrl(unit.avatarId)} alt="" />
                  <span>
                    <b>{unit.name}</b>
                    <small>
                      {unit.hp}/{unit.stats.hp}
                    </small>
                  </span>
                  <em>{!unit.alive ? '败退' : unit.acted ? '已行动' : '可行动'}</em>
                </button>
              ))}
            </div>
            <button className="end-turn" disabled={busy || game.phase !== 'player'} onClick={endTurn}>
              {busy ? '行动执行中…' : '结束我方阶段'}
              <span>→</span>
            </button>
            <div className="triangle">
              {[
                ['icon_sword', '剑'],
                ['icon_axe', '刀斧'],
                ['icon_spear', '枪'],
              ].map(([id, label]) => (
                <span key={id}>
                  <img src={assetUrl(id)} alt="" />
                  {label}
                  <i>克</i>
                </span>
              ))}
              <small>剑</small>
            </div>
          </aside>
          <details className="battle-log">
            <summary>
              战场记录 <span>{game.log.at(-1) || '义军已集结'}</span>
            </summary>
            <ol>
              {game.log.slice(-30).map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ol>
          </details>
        </main>
      )}
      {scene === 'result' && (
        <main
          className={`result-scene ${game.status === 'defeat' ? 'defeat' : ''}`}
          style={{ backgroundImage: `url("${assetUrl('plain_day')}")` }}
        >
          <div className="result-panel panel">
            <span className="eyebrow">第一章 · 桃园结义</span>
            <div className="result-seal">{game.status === 'defeat' ? '败' : '胜'}</div>
            <h1>{game.status === 'defeat' ? '义军受挫' : '桃园之誓，今日践行'}</h1>
            <p>
              {game.status === 'defeat'
                ? '兄弟有人负伤败退。这一次，重新谋定而后动。'
                : '黄巾散兵已退，乡里重获安宁。简雍愿与你们同行。'}
            </p>
            <div className="result-numbers">
              <div>
                <small>历经回合</small>
                <b>{game.turn}</b>
              </div>
              <div>
                <small>击退敌军</small>
                <b>{6 - enemies.length} / 6</b>
              </div>
              <div>
                <small>存活义军</small>
                <b>{playerUnits.filter((unit) => unit.alive).length} / 3</b>
              </div>
            </div>
            {game.status === 'complete' && (
              <div className="recruit">
                <img src={assetUrl('jian_yong_standard_avatar')} alt="简雍" />
                <div>
                  <b>简雍 · 加入队伍</b>
                  <p>儒生 / 舌灿莲花</p>
                </div>
                <span>已保存</span>
              </div>
            )}
            <div className="result-actions">
              <button className="primary" onClick={retry}>
                重新挑战
              </button>
              <button onClick={() => setScene('title')}>返回标题</button>
            </div>
            <small>
              {game.status === 'complete'
                ? '首章结束 · 后续章节筹备中'
                : '可利用林地、伤药与武器相克，保持三兄弟相互支援。'}
            </small>
          </div>
        </main>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-label={modal === 'help' ? '行军指南' : '设置'}
            onClick={(event) => event.stopPropagation()}
          >
            <button className="close" aria-label="关闭" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="eyebrow">三国火纹</span>
            <h2>{modal === 'help' ? '行军指南' : '行军设置'}</h2>
            {modal === 'help' ? (
              <>
                <p>选择己方武将 → 点击蓝色落点 → 攻击、伤药或待机。提交前可按 Esc 或右键撤销预移动。</p>
                <div className="help-rule">
                  <b>剑克刀斧，刀斧克枪，枪克剑</b>
                  <p>优势命中 +15、攻击 +1；劣势反向扣减。张飞克制剑兵，关羽要小心围攻。</p>
                </div>
                <p>林地移动消耗 2，防御 +1、回避 +15。蓝格表示可停留位置，可以穿过友军，但不能停在同一格。</p>
                <p>伤药每人 3 次，每次恢复 10 HP 并消耗行动。刘备在我方阶段开始为相邻同伴恢复 2 HP。</p>
                <p>
                  方向键移动光标，Enter 确认，Esc 返回。菜单中可用 Tab 切换、Enter 确认。G 切换网格，T
                  切换威胁范围。
                </p>
                <p>任意兄弟败退即失败。每轮自动保存，也可在我方稳定状态手动保存。读档保留随机状态。</p>
              </>
            ) : (
              <>
                <label className="setting-row">
                  动画速度
                  <select
                    aria-label="设置中的动画速度"
                    value={settings.speed}
                    onChange={(event) =>
                      setSettings((value) => ({ ...value, speed: Number(event.target.value) }))
                    }
                  >
                    <option value={1}>正常</option>
                    <option value={2}>2 倍</option>
                    <option value={4}>4 倍</option>
                  </select>
                </label>
                <label className="setting-row">
                  显示网格
                  <input
                    type="checkbox"
                    checked={settings.grid}
                    onChange={(event) => setSettings((value) => ({ ...value, grid: event.target.checked }))}
                  />
                </label>
                <label className="setting-row">
                  显示敌方威胁
                  <input
                    type="checkbox"
                    checked={settings.threat}
                    onChange={(event) => setSettings((value) => ({ ...value, threat: event.target.checked }))}
                  />
                </label>
                <label className="setting-row">
                  新征战随机种子
                  <input
                    aria-label="随机种子"
                    type="number"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                  />
                </label>
                <small>
                  默认种子 {RULES.defaultSeed}。同一种子和行动可复现战果；本局种子为 {game.seed}。
                </small>
              </>
            )}
            <button className="primary modal-done" onClick={() => setModal(null)}>
              返回
            </button>
          </section>
        </div>
      )}
      <footer className="app-footer">
        <span>
          三国火纹 <i /> 桃园篇
        </span>
        <span>山河未定，来日方长</span>
      </footer>
    </div>
  );
}

function ForecastSide({ side, unit, enemy = false }: { side: CombatSide; unit: Unit; enemy?: boolean }) {
  return (
    <div className={`forecast-side ${enemy ? 'enemy' : ''}`}>
      <div className="forecast-unit">
        <img src={assetUrl(unit.avatarId)} alt="" />
        <div>
          <h3>{unit.name}</h3>
          <small>{side.weaponName}</small>
        </div>
      </div>
      <div className="forecast-hp">
        HP <b>{side.hp}</b>
        <small>/{side.maxHp}</small>
      </div>
      <dl>
        <div>
          <dt>伤害</dt>
          <dd>
            {side.canAttack ? `${side.damage}${side.attacks > 1 ? ` ×${side.attacks}` : ''}` : '无法反击'}
          </dd>
        </div>
        <div>
          <dt>命中</dt>
          <dd>{side.canAttack ? `${side.hit}%` : '—'}</dd>
        </div>
        <div>
          <dt>暴击</dt>
          <dd>{side.canAttack ? `${side.crit}%` : '—'}</dd>
        </div>
      </dl>
      <p>
        {TERRAINS[side.terrain].name}{' '}
        <span>{side.advantage > 0 ? '相克优势' : side.advantage < 0 ? '相克劣势' : '无相克修正'}</span>
      </p>
    </div>
  );
}

function Inspection({ art }: { art: ArtAssets }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [animate, setAnimate] = useState(true);
  const [facing, setFacing] = useState<1 | -1>(1);
  const states: AnimationName[] = [
    'idle',
    'move',
    'attack',
    'hit',
    'dodge',
    'block',
    'cast',
    'heal',
    'defeat',
  ];
  const variants = [
    { name: '刘备 · 通用步兵', body: 'infantry_player', weapon: 'dual_swords_held' },
    { name: '关羽 · 通用丹阳身体', body: 'danyang_player', weapon: 'green_dragon_held' },
    { name: '张飞 · 枪刺身体', body: 'infantry_attack_spear_player', weapon: 'serpent_spear_held' },
    { name: '黄巾剑兵 · 游戏侧适配', body: 'yellow_raider_enemy', weapon: 'iron_sword_held' },
    { name: '黄巾头目 · 刀', body: 'yellow_raider_enemy', weapon: 'gao_sheng_blade_held' },
  ];
  useEffect(() => {
    let frame = 0;
    const ctx = ref.current!.getContext('2d')!;
    const paint = (time: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#142333';
      ctx.fillRect(0, 0, 1440, 800);
      states.forEach((state, column) => {
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#d3bd8b';
        ctx.fillText(state, column * 160 + 60, 26);
      });
      variants.forEach((variant, row) => {
        states.forEach((state, column) => {
          ctx.strokeStyle = '#304355';
          ctx.strokeRect(column * 160 + 1, row * 148 + 40, 158, 146);
          drawUnitPreview(ctx, art, {
            bodyId: variant.body,
            weaponId: variant.weapon,
            x: column * 160 + 80,
            y: row * 148 + 155,
            state,
            timeMs: animate ? time % animationDuration(art, variant.body, state) : 240,
            facing,
            scale: 1,
            loop: true,
          });
          ctx.fillStyle = '#adbbc7';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(variant.name, column * 160 + 80, row * 148 + 178);
          ctx.textAlign = 'left';
        });
      });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [art, animate, facing]);
  return (
    <main className="inspection">
      <h1>首关武器装配 · 九动作检视</h1>
      <p>实际游戏渲染器，原始比例 1×。关羽使用通用身体，黄巾剑兵使用游戏侧剑类适配。</p>
      <div>
        <button onClick={() => setAnimate(!animate)}>{animate ? '暂停动作' : '播放动作'}</button>
        <button onClick={() => setFacing(facing === 1 ? -1 : 1)}>切换朝向</button>
        <a href="./">返回游戏</a>
      </div>
      <canvas ref={ref} width={1440} height={800} />
    </main>
  );
}
