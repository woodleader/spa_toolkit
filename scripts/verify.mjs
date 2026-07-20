import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Script } from 'node:vm';

const root = process.cwd();
const manifest = JSON.parse(await readFile(resolve(root, 'tool-manifest.json'), 'utf8'));
const errors = [];
const remoteResource = /<(?:script|link|img|iframe|source)\b[^>]*(?:src|href)=["']https?:\/\//gi;
const rootRelativeResource = /<(?:script|link|img|iframe|source)\b[^>]*(?:src|href)=["']\/(?!\/)/gi;
const networkCall = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/g;

async function verifyInternalLinks(sourcePath, html) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) continue;
    const relativeTarget = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    const target = resolve(root, dirname(sourcePath), relativeTarget);
    try { await access(target); } catch { errors.push(`${sourcePath}: broken internal link ${href}`); }
  }
}

for (const tool of manifest.tools) {
  const path = resolve(root, tool.path);
  try { await access(path); } catch { errors.push(`${tool.id}: missing ${tool.path}`); continue; }
  const html = await readFile(path, 'utf8');
  await verifyInternalLinks(tool.path, html);
  const authoredHtml = html.replace(/<!-- TOOLKIT:VENDOR:[\s\S]*?:START -->[\s\S]*?<!-- TOOLKIT:VENDOR:[\s\S]*?:END -->/g, '');
  if (remoteResource.test(authoredHtml)) errors.push(`${tool.id}: remote runtime resource`);
  remoteResource.lastIndex = 0;
  if (rootRelativeResource.test(authoredHtml)) errors.push(`${tool.id}: root-relative runtime resource`);
  rootRelativeResource.lastIndex = 0;
  if (networkCall.test(authoredHtml)) errors.push(`${tool.id}: runtime network call`);
  networkCall.lastIndex = 0;
  if (!html.includes('TOOLKIT:POLICY:offline-first:START') || !html.includes("connect-src 'none'")) errors.push(`${tool.id}: offline content policy missing`);
  for (const match of html.matchAll(/<script(?![^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      new Script(match[1], { filename: tool.path });
    } catch (error) {
      errors.push(`${tool.id}: invalid inline JavaScript (${error.message})`);
    }
  }
}

const index = await readFile(resolve(root, 'index.html'), 'utf8');
await verifyInternalLinks('index.html', index);
if (!index.includes('TOOLKIT:POLICY:offline-first:START')) errors.push('launcher: offline content policy missing');
for (const tool of manifest.tools) {
  if (!index.includes(`data-tool-id="${tool.id}"`)) errors.push(`${tool.id}: launcher metadata not generated`);
}

const pgnCatalog = JSON.parse(await readFile(resolve(root, 'data/j1939-pgns.json'), 'utf8'));
const pgnIds = new Set();
for (const entry of pgnCatalog) {
  if (!Number.isInteger(entry.pgn) || entry.pgn < 0 || entry.pgn > 0x3ffff || typeof entry.name !== 'string' || !entry.name.trim()) {
    errors.push(`j1939 catalog: invalid entry ${JSON.stringify(entry)}`);
  }
  if (pgnIds.has(entry.pgn)) errors.push(`j1939 catalog: duplicate PGN ${entry.pgn}`);
  pgnIds.add(entry.pgn);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${manifest.tools.length} self-contained tool entries.`);
}
