import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 逐格数据是通行权威。美术底图只用于输出人工复核图，不参与地形识别。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(await fs.readFile(path.join(root, 'src/data/chapter1.json'), 'utf8'));
const blockers = new Set(['building', 'water', 'cliff']);
const terrainLabels = {plain: 'P', road: 'R', bridge: 'B', forest: 'F', building: 'H', water: 'W', cliff: 'C'};
const errors = [];
const cells = new Map();
const key = (p) => `${p.x},${p.y}`;
const passable = (p) => {const tile = cells.get(key(p)); return !!tile && !tile.blocked && !blockers.has(tile.terrain);};
if (map.width !== 16 || map.height !== 12 || map.tileSize !== 64) errors.push('首关必须保持16×12逻辑格、每格64像素。');
if (map.tiles.length !== 192) errors.push(`格子数量错误：${map.tiles.length}。`);
for (const tile of map.tiles) {
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y) || tile.x < 0 || tile.x >= map.width || tile.y < 0 || tile.y >= map.height) errors.push(`格子越界：${key(tile)}`);
  if (cells.has(key(tile))) errors.push(`重复格子：${key(tile)}`);
  if (!(tile.terrain in terrainLabels)) errors.push(`未知地形：${key(tile)} ${tile.terrain}`);
  if (typeof tile.blocked !== 'boolean' || tile.height !== 0) errors.push(`未明确标注通行或高度：${key(tile)}`);
  cells.set(key(tile), tile);
}
const deploymentIds = new Set();
const occupied = new Set();
for (const spawn of map.deployments) {
  if (deploymentIds.has(spawn.unitId)) errors.push(`重复部署ID：${spawn.unitId}`);
  if (occupied.has(key(spawn))) errors.push(`出生重叠：${key(spawn)}`);
  if (!passable(spawn)) errors.push(`出生点不可行走：${spawn.unitId} ${key(spawn)}`);
  deploymentIds.add(spawn.unitId); occupied.add(key(spawn));
}
const expected = ['liu_bei','guan_yu','zhang_fei','yellow_1','yellow_2','yellow_3','yellow_4','yellow_5','yellow_chief'];
if (expected.some(id => !deploymentIds.has(id)) || deploymentIds.size !== expected.length) errors.push('首关必须为三兄弟、五名散兵和一名头目。');
const reachable = new Set();
const queue = [map.deployments[0]];
for (let index = 0; index < queue.length; index++) {
  const point = queue[index]; if (!passable(point) || reachable.has(key(point))) continue;
  reachable.add(key(point));
  queue.push({x:point.x+1,y:point.y},{x:point.x-1,y:point.y},{x:point.x,y:point.y+1},{x:point.x,y:point.y-1});
}
for (const spawn of map.deployments) if (!reachable.has(key(spawn))) errors.push(`部署无法从我方区域到达：${spawn.unitId}`);
for (const point of [{x:0,y:4},{x:1,y:4},{x:2,y:4},{x:9,y:0},{x:9,y:10},{x:15,y:5}]) if (!reachable.has(key(point))) errors.push(`桥头或主路未连通：${key(point)}`);
const isolated = map.tiles.filter(t => passable(t) && !reachable.has(key(t)));
if (isolated.length) errors.push(`存在无说明的可走孤岛：${isolated.map(key).join(' ')}`);
const counts = Object.fromEntries(Object.keys(terrainLabels).map(t => [t,map.tiles.filter(cell => cell.terrain === t).length]));
const report = {mapId:map.id,version:map.version,tiles:map.tiles.length,deployments:map.deployments.length,walkable:map.tiles.filter(passable).length,reachable:reachable.size,terrainCounts:counts,errors,visualLimit:'检查图是底图与人工标注的叠加；真实游戏移动与视觉验收另行记录。'};
await fs.mkdir(path.join(root,'evidence'), {recursive:true});
await fs.writeFile(path.join(root,'evidence/chapter1-map-check.json'),JSON.stringify(report,null,2)+'\n');

// 可编辑SVG内嵌原始底图，不引用开发机绝对地址。
const artRoot = process.env.ART_PACK_ROOT || '/Users/didi/Documents/ChatGPT/三国火纹美术资源包';
const local = path.join(root,'public/art/assets/v2/runtime/maps/plain_day.png');
let imagePath;
try {await fs.access(local);imagePath=local;} catch {imagePath=path.join(artRoot,'assets/v2/runtime/maps/plain_day.png');}
try {
  const image = await fs.readFile(imagePath);
  let overlay='';
  for (const tile of map.tiles) {
    const x=tile.x*64,y=tile.y*64;
    overlay+=`<rect x="${x}" y="${y}" width="64" height="64" fill="${tile.blocked?'#53191c':'#14466a'}" fill-opacity="${tile.blocked?'.24':'.08'}" stroke="#f7d58a" stroke-opacity=".7"/>`;
    overlay+=`<rect x="${x+2}" y="${y+2}" width="58" height="17" fill="#102330" fill-opacity=".85"/><text x="${x+5}" y="${y+15}" fill="#fff0c9" font-family="monospace" font-size="12">${tile.x},${tile.y} ${terrainLabels[tile.terrain]}${tile.blocked?'×':''}</text>`;
  }
  for (const p of map.deployments) overlay+=`<circle cx="${p.x*64+32}" cy="${p.y*64+40}" r="13" fill="${p.unitId.startsWith('yellow')?'#b53a35':'#3688bc'}" stroke="#ffe3a0" stroke-width="2"/><text x="${p.x*64+32}" y="${p.y*64+44}" fill="white" font-family="monospace" font-size="10" text-anchor="middle">${p.unitId.startsWith('yellow')?(p.unitId==='yellow_chief'?'B':p.unitId.at(-1)):p.unitId==='liu_bei'?'L':p.unitId==='guan_yu'?'G':'Z'}</text>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="816"><rect width="1024" height="816" fill="#102330"/><image href="data:image/png;base64,${image.toString('base64')}" width="1024" height="768"/>${overlay}<text x="14" y="794" fill="#fff0c9" font-family="sans-serif" font-size="14">P 平地 · R 道路 · B 桥 · F 林地 · H 建筑 · W 深水 · C 悬崖 · × 禁行</text><text x="14" y="812" fill="#b7c6d0" font-family="sans-serif" font-size="12">人工地形检查图；L 刘备 / G 关羽 / Z 张飞 / 1—5 散兵 / B 头目。底部桥仅作景观，桥头待返修。</text></svg>`;
  await fs.writeFile(path.join(root,'evidence/chapter1-terrain-check.svg'),svg);
} catch (error) { console.warn(`检查图未生成：${error.message}`); }
console.log(JSON.stringify(report,null,2));
if (errors.length) process.exitCode=1;
