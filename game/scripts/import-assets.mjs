import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const artRoot = path.resolve(process.env.ART_PACK_ROOT || '/Users/didi/Documents/ChatGPT/三国火纹美术资源包');
const output = path.join(gameRoot, 'public/art');
const sourceManifest = JSON.parse(await readFile(path.join(artRoot, 'assets/v2/manifest.json'), 'utf8'));
const mapping = JSON.parse(await readFile(path.join(gameRoot, 'src/data/art-mapping.json'), 'utf8'));
const ids = new Set([
  'plain_day', 'peach_garden_day',
  ...Object.values(mapping.bindings).flatMap(binding => [binding.body, binding.weapon]),
  ...['liu_bei', 'guan_yu', 'zhang_fei'].flatMap(id => ['calm', 'battle', 'avatar'].map(kind => `${id}_early_${kind}`)),
  'jian_yong_standard_calm', 'jian_yong_standard_avatar', 'yellow_chief_standard_calm', 'yellow_chief_standard_avatar',
  'panel_blue', 'panel_red', 'bar_frame', 'hp_fill', 'icon_experience', 'icon_hp',
  'avatar_frame_player', 'avatar_frame_enemy', 'icon_sword', 'icon_spear', 'icon_axe',
  'cursor_select', 'cursor_attack', 'cursor_pointer', 'legacy_slash', 'advantage', 'legacy_heal', 'level_up', 'defeat_light',
]);
const index = new Map(sourceManifest.assets.map(asset => [asset.id, asset]));
const selected = [...ids].map(id => {
  if (!index.has(id)) throw new Error(`缺少首关资源 ID：${id}（assets/v2/manifest.json）`);
  return index.get(id);
});
for (const [actor, binding] of Object.entries(mapping.bindings)) {
  const body = index.get(binding.body), weapon = index.get(binding.weapon);
  if (weapon.family !== binding.visualFamily) throw new Error(`${actor} 的视觉武器类别与源清单不一致`);
  const sourceCompatible = body.compatibleWeapons.includes(binding.weapon.replace(/_held$/, ''));
  if (!sourceCompatible && !binding.gameSideAdapter) throw new Error(`${actor} 尚未提供 ${binding.body} / ${binding.weapon} 的游戏侧适配声明`);
}
const files = new Map();
const expectedSizes = new Map();
function depend(relativePath, id, role) {
  if (!relativePath) return;
  if (!relativePath.startsWith('assets/v2/runtime/') || relativePath.includes('..')) throw new Error(`资源 ${id} 的运行路径非法：${relativePath}`);
  const record = files.get(relativePath) || { path: relativePath, sourceIds: [], roles: [] };
  if (!record.sourceIds.includes(id)) record.sourceIds.push(id);
  if (!record.roles.includes(role)) record.roles.push(role);
  files.set(relativePath, record);
}
for (const asset of selected) {
  depend(asset.file, asset.id, asset.category);
  expectedSizes.set(asset.file, [asset.width, asset.height]);
  if (asset.rigFile) {
    depend(asset.rigFile, asset.id, 'rig');
    depend(asset.handFile, asset.id, 'native-occlusion');
    expectedSizes.set(asset.handFile, [asset.width, asset.height]);
    const rig = JSON.parse(await readFile(path.join(artRoot, asset.rigFile), 'utf8'));
    if (rig.handRendering !== 'native-occlusion') throw new Error(`${asset.id} 的手层方案不匹配：${rig.handRendering}`);
    if (rig.frames.length !== asset.frames || rig.frameSize !== asset.frameWidth) throw new Error(`${asset.id} 身体尺寸或挂点帧数与 rig 不一致`);
    for (const animation of asset.animations) {
      const rigAnimation = rig.animations.find(item => item.id === animation.id);
      if (!rigAnimation || rigAnimation.row !== animation.row || rigAnimation.frames !== animation.frames || rigAnimation.durationMs !== animation.durationMs) {
        throw new Error(`${asset.id} / ${animation.id} 身体与 rig 的动作版本不一致`);
      }
    }
  }
  depend(asset.secondary?.file, asset.id, 'offhand-weapon');
  depend(asset.attackAnimation?.file, asset.id, 'weapon-animation');
  if (asset.defaultShield) {
    const shield = index.get(`${asset.defaultShield}_held`);
    if (!shield) throw new Error(`${asset.id} 缺少副手盾 ${asset.defaultShield}_held`);
    depend(shield.file, asset.id, 'shield');
  }
}
depend('assets/v2/runtime/ui/widgets.json', 'ui-layout', 'layout');
depend('assets/v2/runtime/integration/canvas-renderer.mjs', 'canvas-renderer', 'reference-renderer');
const records = [];
for (const entry of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
  const original = path.join(artRoot, entry.path);
  let bytes;
  try { bytes = await readFile(original); }
  catch { throw new Error(`资源 ${entry.sourceIds.join(', ')} 缺失依赖：${entry.path}`); }
  if (entry.path.endsWith('.png')) {
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`图片并非有效 PNG：${entry.path}`);
    const expected = expectedSizes.get(entry.path);
    if (expected && (bytes.readUInt32BE(16) !== expected[0] || bytes.readUInt32BE(20) !== expected[1])) {
      throw new Error(`图片尺寸与清单不一致：${entry.path}，应为 ${expected.join('×')}`);
    }
  }
  const destination = path.join(output, entry.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(original, destination);
  records.push({ ...entry, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  version: sourceManifest.version, unitRevision: '2.0.4', assets: selected, mapping,
  widgets: 'assets/v2/runtime/ui/widgets.json',
}, null, 2));
await writeFile(path.join(output, 'import-manifest.json'), JSON.stringify({
  schemaVersion: 1, sourceManifest: 'assets/v2/manifest.json', sourceVersion: sourceManifest.version,
  sourceManifestSha256: createHash('sha256').update(await readFile(path.join(artRoot, 'assets/v2/manifest.json'))).digest('hex'),
  policy: '只导入首关使用文件；源库不变；运行时路径相对于 public/art',
  assetIds: [...ids], files: records,
}, null, 2));
const total = records.reduce((sum, record) => sum + record.bytes, 0);
console.log(`已导入 ${ids.size} 个资源 ID、${records.length} 个依赖文件，${(total / 1024 / 1024).toFixed(2)} MiB；SHA256 来源记录已生成。`);
