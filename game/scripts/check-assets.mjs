import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 此检查不依赖图片解码库；浏览器 Image.decode 和逐帧视觉检查单独记录。
const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public/art');
const artRoot = path.resolve(process.env.ART_PACK_ROOT || '/Users/didi/Documents/ChatGPT/三国火纹美术资源包');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = [];
const warnings = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const relativeRuntime = file => typeof file === 'string' && file.startsWith('assets/v2/runtime/') && !file.includes('..') && !path.isAbsolute(file);
const [manifest, imports, mapping] = await Promise.all([
  readJson(path.join(publicRoot, 'manifest.json')),
  readJson(path.join(publicRoot, 'import-manifest.json')),
  readJson(path.join(root, 'src/data/art-mapping.json')),
]);
const index = new Map(manifest.assets.map(asset => [asset.id, asset]));
const records = new Map(imports.files.map(record => [record.path, record]));
check(index.size === manifest.assets.length, '运行清单存在重复资源 ID');
check(records.size === imports.files.length, '导入记录存在重复路径');
check(isDeepStrictEqual([...index.keys()].sort(), [...imports.assetIds].sort()), '运行清单与来源记录的资源 ID 不一致');
check(isDeepStrictEqual(manifest.mapping, mapping), '运行映射与 src/data/art-mapping.json 不一致，请重新导入');
check(manifest.version === imports.sourceVersion, '运行版本与来源版本不一致');

const dependencies = new Map();
const expectedSizes = new Map();
function dependency(file, id, size) {
  if (!file) return;
  check(relativeRuntime(file), `${id} 使用了非法运行路径：${file}`);
  const owners = dependencies.get(file) || new Set();
  owners.add(id); dependencies.set(file, owners);
  if (size) expectedSizes.set(file, size);
}
for (const item of manifest.assets) {
  dependency(item.file, item.id, [item.width, item.height]);
  if (item.rigFile) {
    dependency(item.rigFile, item.id);
    dependency(item.handFile, item.id, [item.width, item.height]);
    check(Boolean(item.handFile), `${item.id} 缺少原生掌部前景`);
  }
  dependency(item.secondary?.file, item.id);
  dependency(item.attackAnimation?.file, item.id);
  if (item.defaultShield) {
    const shield = index.get(`${item.defaultShield}_held`);
    check(Boolean(shield), `${item.id} 的副手盾未进入清单`);
    dependency(shield?.file, item.id);
  }
}
dependency(manifest.widgets, 'ui-layout');
dependency('assets/v2/runtime/integration/canvas-renderer.mjs', 'canvas-renderer');
for (const [file, owners] of dependencies) {
  const record = records.get(file);
  check(Boolean(record), `依赖未记录：${file}`);
  if (record) check(isDeepStrictEqual([...owners].sort(), [...record.sourceIds].sort()), `资源来源 ID 不匹配：${file}`);
}

let pngCount = 0, byteCount = 0;
const buffers = new Map();
for (const record of imports.files) {
  check(relativeRuntime(record.path), `导入记录含非法路径：${record.path}`);
  check(dependencies.has(record.path), `导入了首关未使用的文件：${record.path}`);
  if (!relativeRuntime(record.path)) continue;
  let bytes;
  try { bytes = await readFile(path.join(publicRoot, record.path)); }
  catch { errors.push(`导入文件缺失：${record.path}`); continue; }
  buffers.set(record.path, bytes); byteCount += bytes.length;
  check(bytes.length === record.bytes, `文件长度变化：${record.path}`);
  check(sha256(bytes) === record.sha256, `SHA256 不一致：${record.path}`);
  if (!record.path.endsWith('.png')) continue;
  pngCount += 1;
  if (bytes.length < 45 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    errors.push(`PNG 签名或长度无效：${record.path}`); continue;
  }
  check(bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR', `PNG 首块无效：${record.path}`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  check(width > 0 && height > 0, `PNG 尺寸无效：${record.path}`);
  const expected = expectedSizes.get(record.path);
  if (expected) check(width === expected[0] && height === expected[1], `PNG 尺寸与元数据不符：${record.path}`);
  let offset = 8, ended = false, dataFound = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > bytes.length) break;
    if (type === 'IDAT') dataFound = true;
    offset += length + 12;
    if (type === 'IEND') { ended = length === 0 && offset === bytes.length; break; }
  }
  check(ended && dataFound, `PNG 数据块不完整：${record.path}`);
}

const expectedActions = ['idle', 'move', 'attack', 'hit', 'dodge', 'block', 'cast', 'heal', 'defeat'];
let rigCount = 0, checkedFrames = 0;
for (const item of manifest.assets.filter(asset => asset.rigFile)) {
  const bytes = buffers.get(item.rigFile);
  if (!bytes) continue;
  const rig = JSON.parse(bytes.toString('utf8')); rigCount += 1;
  check(rig.handRendering === 'native-occlusion', `${item.id} 不是原生掌部遮挡模式`);
  check(rig.frameSize === item.frameWidth && item.frameWidth === item.frameHeight, `${item.id} 的身体与 rig 格子尺寸不同`);
  check(item.columns === 4 && item.rows === 9 && item.frames === 36 && rig.frames.length === 36, `${item.id} 不具备完整九动作四帧`);
  check(item.width === item.frameWidth * 4 && item.height === item.frameHeight * 9, `${item.id} 的图集尺寸与动作网格不符`);
  check(isDeepStrictEqual(item.animations, rig.animations), `${item.id} 的身体与 rig 动作元数据不同`);
  check(isDeepStrictEqual(item.animations.map(animation => animation.id), expectedActions), `${item.id} 动作行顺序不符`);
  for (const [row, animation] of item.animations.entries()) {
    check(animation.row === row && animation.frames === 4 && animation.durationMs > 0, `${item.id}/${animation.id} 行号、帧数或时长无效`);
    check(animation.loop === ['idle', 'move'].includes(animation.id), `${item.id}/${animation.id} 循环属性不符`);
    for (let frame = 0; frame < animation.frames; frame += 1) {
      const bone = rig.frames[row * 4 + frame]; checkedFrames += 1;
      check(bone?.state === animation.id && bone?.frame === frame, `${item.id}/${animation.id}/${frame} 逐帧挂点索引不匹配`);
      check(Number.isFinite(bone?.x) && Number.isFinite(bone?.y) && bone.x >= 0 && bone.x <= rig.frameSize && bone.y >= 0 && bone.y <= rig.frameSize, `${item.id}/${animation.id}/${frame} 主掌心坐标无效`);
    }
  }
}
for (const [person, binding] of Object.entries(mapping.bindings)) {
  const body = index.get(binding.body), weapon = index.get(binding.weapon);
  check(Boolean(body && weapon), `${person} 的身体或武器没有导入`);
  if (!body || !weapon) continue;
  check(binding.visualFamily === weapon.family, `${person} 不能改写源美术武器类别`);
  const compatible = body.compatibleWeapons.includes(binding.weapon.replace(/_held$/, ''));
  check(compatible || (binding.gameSideAdapter === true && Boolean(binding.adapter)), `${person} 缺少游戏侧绑定适配说明`);
  check(Number.isFinite(weapon.grip?.x) && Number.isFinite(weapon.grip?.y) && weapon.defaultScale > 0, `${person} 武器缺少合法握点或比例`);
  if (weapon.twoHanded) check(Boolean(weapon.handleRig?.primary && weapon.handleRig?.secondary && weapon.handleRig?.start && weapon.handleRig?.end), `${person} 双手武器缺少完整杆身配置`);
}
check(mapping.bindings.guan_yu.visualFamily === 'blade' && mapping.bindings.guan_yu.combatFamily === 'axe', '关羽的视觉类别与战斗类别必须分开');
check(mapping.bindings.yellow_sword.weapon === 'iron_sword_held' && mapping.bindings.yellow_sword.combatFamily === 'sword', '首关黄巾剑兵不得替换为刀兵');

const widgetsBytes = buffers.get(manifest.widgets);
if (widgetsBytes) {
  const widgets = JSON.parse(widgetsBytes.toString('utf8'));
  check(widgets.dialogue?.nineSlice === 32 && widgets.dialogue?.typewriter?.charactersPerSecond > 0, '对话九宫格或打字机元数据无效');
  check(isDeepStrictEqual(widgets.bars?.inner, [4, 4, 152, 8]), '状态条内框与源 UI 约定不一致');
  for (const id of ['panel_blue', 'panel_red']) {
    const panel = index.get(id);
    check(Boolean(panel), `缺少 UI 面板 ${id}`);
    check(Object.values(panel?.nineSlice || {}).every(value => value === widgets.dialogue.nineSlice) && Object.keys(panel?.nineSlice || {}).length === 4, `${id} 九宫格边距与 widgets 不一致`);
  }
  for (const id of ['bar_frame', 'hp_fill', 'icon_experience', 'icon_sword', 'icon_spear', 'icon_axe']) check(index.has(id), `缺少首关状态 UI：${id}`);
}

let sourceVerified = false;
try {
  await access(path.join(artRoot, imports.sourceManifest));
  sourceVerified = true;
} catch {
  const message = '本机未发现原始美术库；已验证导入包完整性，未复核外部源文件。设置 ART_PACK_ROOT 可增加源库对照。';
  if (process.env.ART_PACK_ROOT) errors.push(`ART_PACK_ROOT 无效：${artRoot}`); else warnings.push(message);
}
if (sourceVerified) {
  const sourceBytes = await readFile(path.join(artRoot, imports.sourceManifest));
  check(sha256(sourceBytes) === imports.sourceManifestSha256, '外部源清单已变化；需核对后重新导入');
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const originalIndex = new Map(source.assets.map(item => [item.id, item]));
  for (const item of manifest.assets) check(isDeepStrictEqual(item, originalIndex.get(item.id)), `源映射元数据发生改写：${item.id}`);
  for (const record of imports.files) {
    if (!relativeRuntime(record.path)) continue;
    try { check(sha256(await readFile(path.join(artRoot, record.path))) === record.sha256, `导入文件与外部源不一致：${record.path}`); }
    catch { errors.push(`外部源依赖缺失：${record.path}`); }
  }
}
const referenceRenderer = buffers.get('assets/v2/runtime/integration/canvas-renderer.mjs');
check(referenceRenderer && sha256(await readFile(path.join(root, 'src/render/asset-renderer.mjs'))) === sha256(referenceRenderer), '游戏引用绘制器与记录的源版本不一致');

const report = {
  status: errors.length ? 'failed' : 'passed', assetCount: index.size, fileCount: records.size, pngCount, byteCount,
  rigCount, checkedFrames, bindingCount: Object.keys(mapping.bindings).length, sourceVerified,
  scope: 'SHA256、运行依赖闭包、PNG 签名/尺寸/块结构、源映射、九动作与逐帧掌心、UI 元数据',
  limits: 'PNG 浏览器解码、实际动态、交互与用户视觉验收不由此脚本代替', errors, warnings,
};
await mkdir(path.join(root, 'evidence/art'), { recursive: true });
await writeFile(path.join(root, 'evidence/art/check-assets.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
