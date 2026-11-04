import { drawUnit, drawVfx } from './asset-renderer.mjs';

export type AnimationName =
  'idle' | 'move' | 'attack' | 'hit' | 'dodge' | 'block' | 'cast' | 'heal' | 'defeat';
export interface Position {
  x: number;
  y: number;
}
interface AnimationMeta {
  id: AnimationName;
  row: number;
  frames: number;
  durationMs: number;
  loop: boolean;
}
interface AssetMeta {
  id: string;
  file: string;
  category: string;
  width: number;
  height: number;
  handFile?: string;
  rigFile?: string;
  faction?: string;
  defaultShield?: string;
  secondary?: { file: string };
  attackAnimation?: { file: string };
  animations?: AnimationMeta[];
  frames?: number;
  frameWidth?: number;
  frameHeight?: number;
  frameDurationMs?: number;
  [key: string]: unknown;
}
interface RigMeta {
  animations: AnimationMeta[];
  frameSize: number;
  handRendering: string;
  [key: string]: unknown;
}
export interface ArtAssets {
  metadata: Map<string, AssetMeta>;
  images: Map<string, HTMLImageElement>;
  rigs: Map<string, RigMeta>;
  widgets: {
    dialogue: {
      texture: string;
      nineSlice: number;
      typewriter: { charactersPerSecond: number; skipOnConfirm: boolean };
    };
    bars: { frame: string; inner: number[]; hp: string; mp: string; burst: string };
    weaponAffinityIcons: string[];
  };
}
export interface RenderUnit extends Position {
  id: string;
  name: string;
  renderClassId: string;
  artWeaponId: string;
  faction: string;
  hp: number;
  stats: { hp: number };
  acted: boolean;
  alive: boolean;
  facing: 1 | -1;
}
export interface UnitVisual extends Partial<Position> {
  state?: AnimationName;
  timeMs?: number;
  facing?: 1 | -1;
  hp?: number;
  opacity?: number;
  visible?: boolean;
}
export interface BattleAnimation {
  units?: Record<string, UnitVisual>;
  effects?: { id: string; x: number; y: number; timeMs: number }[];
  floats?: { x: number; y: number; text: string; color?: string; progress?: number }[];
}
export interface BattleView {
  state: { units: RenderUnit[] };
  map: { width: number; height: number; tileSize: number; visualAssetId: string };
  cursor?: Position;
  selectedId?: string | null;
  previewPosition?: Position | null;
  moveCells?: Position[];
  attackCells?: Position[];
  path?: Position[];
  threat?: Position[];
  grid?: boolean;
  animation?: BattleAnimation;
}

const base = `${import.meta.env.BASE_URL}art/`;
let currentMetadata = new Map<string, AssetMeta>();
// CSS 变量中的相对 url 会按样式表地址解析；统一以文档为基准生成同源完整 URL。
const imageUrl = (file: string) => new URL(`${base}${file}`, document.baseURI).href;

export function assetUrl(id: string): string {
  const asset = currentMetadata.get(id);
  if (!asset) throw new Error(`未加载美术资源：${id}`);
  return imageUrl(asset.file);
}

async function readJson<T>(relativePath: string): Promise<T> {
  const response = await fetch(`${base}${relativePath}`);
  if (!response.ok) throw new Error(`资源加载失败（${response.status}）：${relativePath}`);
  return response.json() as Promise<T>;
}

export async function loadArt(onProgress?: (loaded: number, total: number) => void): Promise<ArtAssets> {
  const manifest = await readJson<{ assets: AssetMeta[]; widgets: string }>('manifest.json');
  const metadata = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const imagePaths = new Set<string>();
  const rigPaths = new Set<string>();
  for (const asset of manifest.assets) {
    imagePaths.add(asset.file);
    if (asset.handFile) imagePaths.add(asset.handFile);
    if (asset.rigFile) rigPaths.add(asset.rigFile);
    if (asset.secondary?.file) imagePaths.add(asset.secondary.file);
    if (asset.attackAnimation?.file) imagePaths.add(asset.attackAnimation.file);
  }
  const images = new Map<string, HTMLImageElement>();
  const rigs = new Map<string, RigMeta>();
  let loaded = 0;
  const total = imagePaths.size + rigPaths.size + 1;
  onProgress?.(loaded, total);
  const done = () => {
    loaded += 1;
    onProgress?.(loaded, total);
  };
  const widgetsPromise = readJson<ArtAssets['widgets']>(manifest.widgets).then((data) => {
    done();
    return data;
  });
  await Promise.all([
    ...[...imagePaths].map(async (file) => {
      const picture = new Image();
      picture.src = imageUrl(file);
      try {
        await picture.decode();
      } catch {
        throw new Error(`图片无法解码：${file}。请重新运行 npm run import:assets。`);
      }
      images.set(file, picture);
      done();
    }),
    ...[...rigPaths].map(async (file) => {
      rigs.set(file, await readJson<RigMeta>(file));
      done();
    }),
  ]);
  const widgets = await widgetsPromise;
  currentMetadata = metadata;
  return { metadata, images, rigs, widgets };
}

function image(assets: ArtAssets, id: string): HTMLImageElement | undefined {
  const entry = assets.metadata.get(id);
  return entry ? assets.images.get(entry.file) : undefined;
}

function equipped(assets: ArtAssets, bodyId: string, weaponId: string): Record<string, unknown> {
  const item = assets.metadata.get(bodyId);
  const weapon = assets.metadata.get(weaponId);
  if (!item?.rigFile || !weapon) throw new Error(`单位配置缺失：${bodyId} / ${weaponId}`);
  const shield = item.defaultShield ? assets.metadata.get(`${item.defaultShield}_held`) : undefined;
  return {
    item,
    body: assets.images.get(item.file),
    hands: item.handFile ? assets.images.get(item.handFile) : undefined,
    rig: assets.rigs.get(item.rigFile),
    weapon,
    weaponImage: assets.images.get(weapon.file),
    secondaryImage: weapon.secondary ? assets.images.get(weapon.secondary.file) : undefined,
    weaponAnimationImage: weapon.attackAnimation ? assets.images.get(weapon.attackAnimation.file) : undefined,
    shield,
    shieldImage: shield ? assets.images.get(shield.file) : undefined,
    faction: item.faction,
    showFactionMarker: false,
  };
}

export function animationDuration(assets: ArtAssets, bodyId: string, state: AnimationName): number {
  const item = assets.metadata.get(bodyId);
  const animation = item?.animations?.find((entry) => entry.id === state);
  return animation ? animation.frames * animation.durationMs : 480;
}

export function drawUnitPreview(
  ctx: CanvasRenderingContext2D,
  assets: ArtAssets,
  options: {
    bodyId: string;
    weaponId: string;
    x: number;
    y: number;
    state: AnimationName;
    timeMs: number;
    facing?: 1 | -1;
    scale?: number;
    showBone?: boolean;
    loop?: boolean;
  },
): void {
  drawUnit(ctx, equipped(assets, options.bodyId, options.weaponId), {
    x: options.x,
    y: options.y,
    state: options.state,
    timeMs: options.timeMs,
    facing: options.facing === -1 ? 'left' : 'right',
    scale: options.scale ?? 1,
    showBone: options.showBone ?? false,
    loopOverride: options.loop ?? false,
  });
}

const backgrounds = new WeakMap<ArtAssets, Map<string, HTMLCanvasElement>>();
function background(assets: ArtAssets, id: string, width: number, height: number): HTMLCanvasElement {
  let cache = backgrounds.get(assets);
  if (!cache) {
    cache = new Map();
    backgrounds.set(assets, cache);
  }
  const key = `${id}:${width}:${height}`;
  const previous = cache.get(key);
  if (previous) return previous;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const picture = image(assets, id);
  if (!context || !picture) throw new Error(`战场底图未加载：${id}`);
  context.imageSmoothingEnabled = false;
  context.drawImage(picture, 0, 0, width, height);
  cache.set(key, canvas);
  return canvas;
}

function paintCells(
  ctx: CanvasRenderingContext2D,
  cells: Position[],
  size: number,
  fill: string,
  stroke: string,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  for (const cell of cells) {
    ctx.fillRect(cell.x * size + 1, cell.y * size + 1, size - 2, size - 2);
    ctx.strokeRect(cell.x * size + 1.5, cell.y * size + 1.5, size - 3, size - 3);
  }
}

export function drawBattle(
  ctx: CanvasRenderingContext2D,
  assets: ArtAssets,
  view: BattleView,
  timeMs: number,
): void {
  const { map } = view;
  const size = map.tileSize;
  const width = map.width * size,
    height = map.height * size;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(background(assets, map.visualAssetId, width, height), 0, 0);
  if (view.grid) {
    ctx.strokeStyle = 'rgba(28,33,31,.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < map.width; x += 1) {
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, height);
    }
    for (let y = 1; y < map.height; y += 1) {
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(width, y * size + 0.5);
    }
    ctx.stroke();
  }
  paintCells(ctx, view.threat || [], size, 'rgba(165,33,64,.18)', 'rgba(229,78,94,.35)');
  paintCells(ctx, view.moveCells || [], size, 'rgba(40,119,204,.29)', 'rgba(158,204,255,.46)');
  paintCells(ctx, view.attackCells || [], size, 'rgba(196,45,54,.32)', 'rgba(255,170,128,.64)');
  if (view.path && view.path.length > 1) {
    ctx.strokeStyle = '#fff0a7';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    view.path.forEach((point, index) => {
      const x = (point.x + 0.5) * size,
        y = (point.y + 0.5) * size;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    const end = view.path.at(-1)!;
    ctx.fillStyle = '#fff0a7';
    ctx.fillRect((end.x + 0.5) * size - 4, (end.y + 0.5) * size - 4, 8, 8);
  }
  const drawables = view.state.units
    .map((unit) => {
      const override = view.animation?.units?.[unit.id];
      const preview = unit.id === view.selectedId ? view.previewPosition : null;
      return {
        unit,
        override,
        x: override?.x ?? preview?.x ?? unit.x,
        y: override?.y ?? preview?.y ?? unit.y,
      };
    })
    .filter(({ unit, override }) => override?.visible ?? unit.alive)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const { unit, override, x, y } of drawables) {
    const selected = unit.id === view.selectedId;
    const footX = x * size + size / 2,
      footY = y * size + size - 6;
    const factionColor =
      unit.faction === 'enemy' ? '#ed7970' : unit.faction === 'ally' ? '#74d38b' : '#6db3ff';
    ctx.save();
    ctx.globalAlpha = override?.opacity ?? (unit.acted && !override?.state ? 0.53 : 1);
    // 阵营色只出现在脚下，不改写身体服色，也不描整个人物外轮廓。
    ctx.fillStyle = 'rgba(10,15,19,.34)';
    ctx.beginPath();
    ctx.ellipse(footX, footY - 1, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = factionColor;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(footX, footY - 1, selected ? 21 : 17, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawUnitPreview(ctx, assets, {
      bodyId: unit.renderClassId,
      weaponId: unit.artWeaponId,
      x: footX,
      y: footY,
      state: override?.state ?? 'idle',
      timeMs: override?.timeMs ?? timeMs,
      facing: override?.facing ?? unit.facing,
      scale: size / 64,
    });
    const hp = override?.hp ?? unit.hp;
    if ((hp < unit.stats.hp || selected) && hp > 0) {
      ctx.fillStyle = '#111b24';
      ctx.fillRect(footX - 19, footY + 3, 38, 5);
      ctx.fillStyle = hp <= unit.stats.hp / 3 ? '#ed8c63' : '#a5d17c';
      ctx.fillRect(footX - 18, footY + 4, Math.max(1, Math.round((36 * hp) / unit.stats.hp)), 3);
    }
    if (unit.acted && !override?.state) {
      ctx.fillStyle = '#f7e5b6';
      ctx.fillRect(footX + 16, footY - 10, 4, 4);
    }
    ctx.restore();
  }
  for (const effect of view.animation?.effects || []) {
    const meta = assets.metadata.get(effect.id),
      picture = image(assets, effect.id);
    if (meta && picture)
      drawVfx(ctx, picture, meta, {
        x: (effect.x + 0.5) * size,
        y: (effect.y + 0.85) * size,
        timeMs: effect.timeMs,
        scale: size / 64,
      });
  }
  for (const floating of view.animation?.floats || []) {
    const progress = floating.progress ?? 0;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, progress - 0.7) / 0.3;
    ctx.font = 'bold 21px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    const x = (floating.x + 0.5) * size,
      y = floating.y * size - 10 - progress * 20;
    ctx.strokeStyle = '#17202d';
    ctx.strokeText(floating.text, x, y);
    ctx.fillStyle = floating.color ?? '#fff4cf';
    ctx.fillText(floating.text, x, y);
    ctx.restore();
  }
  if (view.cursor) {
    const cursorImage = image(assets, 'cursor_select');
    if (cursorImage) {
      ctx.globalAlpha = 0.82 + Math.sin(timeMs / 220) * 0.18;
      ctx.drawImage(cursorImage, view.cursor.x * size, view.cursor.y * size, size, size);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
