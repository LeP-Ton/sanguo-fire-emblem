import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(gameRoot, 'dist');
const publicRoot = path.join(gameRoot, 'public');
const evidenceRoot = path.join(gameRoot, 'evidence');
const testBase = 'https://example.invalid/arbitrary/subdirectory/sanguo/';
const errors = [];
const warnings = [];
const resources = new Map();
const textFiles = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) errors.push(message); };

async function readBuilt(relative) {
  try { return await readFile(path.join(distRoot, relative)); }
  catch { errors.push(`构建资源缺失：${relative}`); return null; }
}

// 使用任意子目录模拟 URL 解析；真正的 HTTP 加载与解码由浏览器验收另行执行。
function localUrl(reference, from = 'index.html') {
  if (/^(data:|#)/i.test(reference)) return null;
  if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(reference)) {
    errors.push(`资源必须使用相对 URL：${from} → ${reference}`); return null;
  }
  const resolved = new URL(reference, new URL(from, testBase));
  if (!resolved.href.startsWith(testBase)) {
    errors.push(`资源路径逃出部署子目录：${from} → ${reference}`); return null;
  }
  return decodeURIComponent(resolved.pathname.slice(new URL(testBase).pathname.length));
}

async function register(relative, kind, extra = {}) {
  if (!relative || resources.has(relative)) return;
  const resolved = localUrl(`./${relative}`);
  if (!resolved) return;
  const bytes = await readBuilt(relative);
  if (!bytes) return;
  resources.set(relative, { url: `./${relative}`, kind, bytes: bytes.length, sha256: sha256(bytes), ...extra });
}

async function scanDirectory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await scanDirectory(path.join(directory, entry.name), relative);
    else if (/\.(?:html|css|js|mjs|map)$/.test(entry.name) && !relative.startsWith('art/')) textFiles.push(relative);
  }
}

const htmlBytes = await readBuilt('index.html');
if (!htmlBytes) {
  console.error('未发现构建产物。请先运行 npm run build。'); process.exit(1);
}
const html = htmlBytes.toString('utf8');
await register('index.html', 'html');
let moduleCount = 0, stylesheetCount = 0;
for (const match of html.matchAll(/<(script|link)\b([^>]+)>/g)) {
  const tag = match[1], attributes = match[2];
  const href = attributes.match(/\b(?:src|href)=["']([^"']+)["']/)?.[1];
  if (!href) continue;
  const isModule = tag === 'script' && /\btype=["']module["']/.test(attributes);
  const isStyle = tag === 'link' && /\brel=["']stylesheet["']/.test(attributes);
  if (isModule) moduleCount += 1;
  if (isStyle) stylesheetCount += 1;
  const relative = localUrl(href);
  if (relative) await register(relative, isModule ? 'module' : isStyle ? 'stylesheet' : 'html-reference');
}
check(moduleCount > 0, 'index.html 缺少 ES module 入口');
check(stylesheetCount > 0, 'index.html 缺少独立 CSS 入口');

await scanDirectory(distRoot);
let jsCombined = '';
const forbiddenPaths = [/\/Users\//, /\/home\//, /\/private\/tmp\//, /\/private\/var\//, /[A-Z]:\\(?:Users|Documents)\\/i, /file:\/\//i];
for (const relative of textFiles) {
  const text = (await readFile(path.join(distRoot, relative), 'utf8'));
  for (const pattern of forbiddenPaths) check(!pattern.test(text), `生产文本含开发机绝对路径：${relative} / ${pattern}`);
  check(!/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i.test(text), `生产文本引用本地开发服务：${relative}`);
  if (/\.(?:js|mjs)$/.test(relative)) {
    jsCombined += text;
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g)) {
      const reference = match[1];
      if (!reference.startsWith('.') && !reference.startsWith('/')) continue;
      const imported = localUrl(reference, relative);
      if (imported) await register(imported, 'module-reference');
    }
  }
  if (relative.endsWith('.css')) {
    for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
      const referenced = localUrl(match[1], relative);
      if (referenced) await register(referenced, 'css-reference');
    }
  }
}
check(/["']\.\/art\/["']/.test(jsCombined), '生产 bundle 未保留相对 art/ 加载前缀');
check(jsCombined.includes('manifest.json'), '生产 bundle 未包含美术清单加载入口');

const manifestBytes = await readBuilt('art/manifest.json');
const importsBytes = await readBuilt('art/import-manifest.json');
let pngCount = 0, importedFiles = 0, metadataCount = 0;
if (manifestBytes && importsBytes) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const imports = JSON.parse(importsBytes.toString('utf8'));
  const records = new Map(imports.files.map(record => [record.path, record]));
  metadataCount = manifest.assets.length;
  await register('art/manifest.json', 'art-manifest');
  await register('art/import-manifest.json', 'provenance');
  for (const file of ['manifest.json', 'import-manifest.json']) {
    check(sha256(await readFile(path.join(publicRoot, 'art', file))) === sha256(await readFile(path.join(distRoot, 'art', file))), `生产 ${file} 与 public/ 不一致，可能构建已过时`);
  }
  const required = new Map();
  const requireFile = (file, id) => {
    if (!file) return;
    check(file.startsWith('assets/v2/runtime/') && !file.includes('..') && !path.isAbsolute(file), `清单含非法美术依赖：${id} → ${file}`);
    const owners = required.get(file) || [];
    if (!owners.includes(id)) owners.push(id);
    required.set(file, owners);
  };
  for (const item of manifest.assets) {
    requireFile(item.file, item.id);
    requireFile(item.handFile, item.id);
    requireFile(item.rigFile, item.id);
    requireFile(item.secondary?.file, item.id);
    requireFile(item.attackAnimation?.file, item.id);
    if (item.defaultShield) {
      const shield = manifest.assets.find(asset => asset.id === `${item.defaultShield}_held`);
      check(Boolean(shield), `生产清单缺少副手盾：${item.id}`);
      requireFile(shield?.file, item.id);
    }
  }
  requireFile(manifest.widgets, 'ui-layout');
  for (const [file, owners] of required) {
    check(records.has(file), `生产清单依赖不在来源记录内：${file}`);
    await register(`art/${file}`, file.endsWith('.png') ? 'image' : 'art-json', { sourceIds: owners, browserRequired: true });
  }
  for (const record of imports.files) {
    if (!record.path.startsWith('assets/v2/runtime/') || record.path.includes('..')) continue;
    importedFiles += 1;
    const built = await readBuilt(`art/${record.path}`);
    if (!built) continue;
    let original;
    try { original = await readFile(path.join(publicRoot, 'art', record.path)); }
    catch { errors.push(`public/ 缺少来源文件：${record.path}`); continue; }
    check(sha256(built) === record.sha256, `生产文件与导入 SHA256 不一致：${record.path}`);
    check(sha256(built) === sha256(original), `生产文件与 public/ 字节不同：${record.path}`);
    if (record.path.endsWith('.png')) {
      pngCount += 1;
      check(built.toString('hex', 0, 8) === '89504e470d0a1a0a', `生产 PNG 签名无效：${record.path}`);
    }
    await register(`art/${record.path}`, record.path.endsWith('.mjs') ? 'reference-only' : 'imported-file', { sourceIds: record.sourceIds, browserRequired: required.has(record.path) });
  }
}

const resourceList = [...resources.values()].sort((a, b) => a.url.localeCompare(b.url));
const report = {
  status: errors.length ? 'failed' : 'passed', moduleCount, stylesheetCount, checkedTextFiles: textFiles.length,
  assetCount: metadataCount, importedFiles, pngCount, relativeResources: resourceList.length,
  simulatedDeploymentBase: testBase, publicAndDistSha256Equal: errors.every(message => !/SHA256|字节不同|构建已过时/.test(message)),
  scope: 'HTML 模块/CSS 相对引用、bundle 开发机路径、任意子目录 URL 静态解析、清单依赖、生产文件存在性、dist 与 public SHA256',
  limits: '本脚本不运行 HTTP 服务或浏览器；真实子目录部署、图片解码和游玩另行验收',
  resources: './build-resources.json', errors, warnings,
};
await mkdir(evidenceRoot, { recursive: true });
await writeFile(path.join(evidenceRoot, 'build-resources.json'), JSON.stringify({
  base: './', usage: '相对于实际部署目录解析每个 url；kind=image 的条目可用浏览器 Image.decode() 验证',
  resources: resourceList,
}, null, 2) + '\n');
await writeFile(path.join(evidenceRoot, 'build-check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
