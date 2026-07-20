import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(resolve(root, path), 'utf8');
const write = (path, value) => writeFile(resolve(root, path), value);

const runtimeDefinitions = {
  'safe-document': {
    file: 'scripts/runtime/safe-document.mjs',
    global: 'ToolboxSafeDocument',
    exports: ['escapeHtml', 'escapeAttribute'],
    targets: ['fmea/fmea.html', 'dbc_parser/dbc_parser.html', 'json_compare/json_compare.html']
  },
  workspace: {
    file: 'scripts/runtime/workspace.mjs',
    global: 'ToolboxWorkspace',
    exports: ['createWorkspace'],
    targets: ['fmea/fmea.html', 'fakra_cables/fakra_cables.html', 'md5check/md5check.html', 'fpdlink_loss/fpdlink_loss.html', 'gmsl2_loss/gmsl2_loss.html']
  },
  'channel-budget': {
    file: 'scripts/runtime/channel-budget.mjs',
    global: 'ToolboxChannelBudget',
    exports: ['solveCoefficients', 'solveSinglePoint', 'calculateChannelBudget'],
    targets: ['fpdlink_loss/fpdlink_loss.html', 'gmsl2_loss/gmsl2_loss.html']
  },
  'engineering-kernels': {
    file: 'scripts/runtime/engineering-kernels.mjs',
    global: 'ToolboxEngineeringKernels',
    exports: ['saturationPressureHPa', 'dewPointC', 'calculateDesiccant', 'calculateReactionScenario', 'calculateLatency', 'applyRadialDistortion', 'calculateGroundFov', 'calculateSensorTopFootprint'],
    targets: ['desiccant_calc/desiccant_calc.html', 'driver_reaction_time/driver_reaction_time.html', 'pixel_estimator/pixel_estimator.html', 'glass_latency/glass_latency.html', 'adas_sensor_fov/adas_sensor_fov.html']
  }
};

const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

function browserBundle(source, globalName, exportNames) {
  const implementation = source.replace(/^export\s+/gm, '');
  return `(function () {\n${implementation}\nwindow.${globalName} = Object.freeze({ ${exportNames.join(', ')} });\n}());`;
}

function replaceGeneratedBlock(html, name, content, insertionPoint = '</head>') {
  const start = `<!-- TOOLKIT:${name}:START -->`;
  const end = `<!-- TOOLKIT:${name}:END -->`;
  const block = `${start}\n${content}\n${end}`;
  const existing = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (existing.test(html)) return html.replace(existing, block);
  if (!html.includes(insertionPoint)) throw new Error(`Cannot insert ${name}: ${insertionPoint} not found.`);
  return html.replace(insertionPoint, `${block}\n${insertionPoint}`);
}

async function embedRuntimes() {
  for (const [name, definition] of Object.entries(runtimeDefinitions)) {
    const source = await read(definition.file);
    const script = `<script data-toolkit-runtime="${name}">\n${browserBundle(source, definition.global, definition.exports)}\n</script>`;
    for (const target of definition.targets) {
      const html = await read(target);
      await write(target, replaceGeneratedBlock(html, `RUNTIME:${name}`, script));
    }
  }
}

async function embedThree() {
  let html = await read('plot_3d/plot_3d.html');
  html = html
    .replace(/^\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>\s*$/m, '')
    .replace(/^\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/examples\/js\/controls\/OrbitControls\.js"><\/script>\s*$/m, '');
  const three = await read('vendor/three-r128/three.min.js');
  const controls = await read('vendor/three-r128/OrbitControls.js');
  const license = (await read('vendor/three-r128/LICENSE')).trim();
  const scripts = `<!--\n${license}\n-->\n<script data-vendored-runtime="three-r128">\n${three}\n</script>\n<script data-vendored-runtime="orbit-controls-r128">\n${controls}\n</script>`;
  html = replaceGeneratedBlock(html, 'VENDOR:three-r128', scripts);
  await write('plot_3d/plot_3d.html', html);
}

async function embedOfflinePolicy() {
  const manifest = JSON.parse(await read('tool-manifest.json'));
  for (const target of ['index.html', ...manifest.tools.map(tool => tool.path)]) {
    const html = await read(target);
    const policy = `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`;
    await write(target, replaceGeneratedBlock(html, 'POLICY:offline-first', policy));
  }
}

async function synchronizeLauncher() {
  const manifest = JSON.parse(await read('tool-manifest.json'));
  let html = await read('index.html');
  for (const tool of manifest.tools) {
    const escapedPath = tool.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const anchor = new RegExp(`<a\\s+href="${escapedPath}"\\s+class="app-card"[^>]*>`);
    if (!anchor.test(html)) throw new Error(`Launcher card not found for ${tool.path}.`);
    html = html.replace(anchor, `<a href="${tool.path}" class="app-card" data-tool-id="${tool.id}" data-tags="${tool.tags.join(',')}">`);
    const title = new RegExp(`(<a[^>]*data-tool-id="${tool.id}"[^>]*>[\\s\\S]*?<div class="app-title">)[\\s\\S]*?(</div>)`);
    if (!title.test(html)) throw new Error(`Launcher title not found for ${tool.id}.`);
    html = html.replace(title, `$1${tool.title}$2`);
  }
  const manifestScript = `<script id="tool-manifest" type="application/json">${JSON.stringify(manifest)}</script>`;
  html = replaceGeneratedBlock(html, 'DATA:tool-manifest', manifestScript, '</body>');
  await write('index.html', html);

  let readme = await read('README.md');
  const rows = manifest.tools.map(tool => `| ${tool.title} | \`${tool.path}\` | ${tool.tags.join(', ')} |`).join('\n');
  const inventory = `<!-- TOOLKIT:README:START -->\n\n## Tool inventory\n\n| Tool | Entry | Tags |\n| --- | --- | --- |\n${rows}\n\nGenerated from \`tool-manifest.json\`.\n\n<!-- TOOLKIT:README:END -->`;
  const inventoryPattern = /<!-- TOOLKIT:README:START -->[\s\S]*?<!-- TOOLKIT:README:END -->/;
  readme = inventoryPattern.test(readme) ? readme.replace(inventoryPattern, inventory) : `${readme.trimEnd()}\n\n${inventory}\n`;
  await write('README.md', readme);
}

const toolsWithOwnThemeToggle = new Set([
  'md5check/md5check.html',
  'json_compare/json_compare.html',
  'markings/regulatory_marks.html'
]);

async function embedTheme() {
  const manifest = JSON.parse(await read('tool-manifest.json'));
  const css = (await read('styles/theme.css')).trim();
  const style = `<style data-toolkit-theme="neo-brutalist">\n${css}\n</style>`;
  for (const tool of manifest.tools) {
    const html = await read(tool.path);
    await write(tool.path, replaceGeneratedBlock(html, 'THEME:neo-brutalist', style));
  }
}

const themeToggleMarkup = `<button id="toolkit-theme-toggle" aria-label="Toggle dark mode">
<svg id="toolkit-theme-sun" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
<svg id="toolkit-theme-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
</button>
<script data-toolkit-runtime="theme-toggle">
(function () {
  var KEY = 'toolbox-theme';
  var root = document.documentElement;
  var sun = document.getElementById('toolkit-theme-sun');
  var moon = document.getElementById('toolkit-theme-moon');
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(theme) {
    root.dataset.theme = theme;
    sun.style.display = theme === 'dark' ? 'block' : 'none';
    moon.style.display = theme === 'dark' ? 'none' : 'block';
  }
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (error) { stored = null; }
  var theme = stored || (media.matches ? 'dark' : 'light');
  apply(theme);
  document.getElementById('toolkit-theme-toggle').addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, theme); } catch (error) { /* private mode */ }
    apply(theme);
  });
  media.addEventListener('change', function (event) {
    var manual = null;
    try { manual = localStorage.getItem(KEY); } catch (error) { manual = null; }
    if (!manual) {
      theme = event.matches ? 'dark' : 'light';
      apply(theme);
    }
  });
}());
</script>`;

async function embedBackLink() {
  const manifest = JSON.parse(await read('tool-manifest.json'));
  const markup = '<a id="toolkit-back-link" href="../index.html">← Toolbox</a>';
  for (const tool of manifest.tools) {
    const html = await read(tool.path);
    await write(tool.path, replaceGeneratedBlock(html, 'THEME:back-link', markup, '</body>'));
  }
}

async function embedThemeToggle() {
  const manifest = JSON.parse(await read('tool-manifest.json'));
  for (const tool of manifest.tools) {
    if (toolsWithOwnThemeToggle.has(tool.path)) continue;
    const html = await read(tool.path);
    await write(tool.path, replaceGeneratedBlock(html, 'THEME:toggle', themeToggleMarkup, '</body>'));
  }
}

async function embedJ1939Catalog() {
  const catalog = JSON.parse(await read('data/j1939-pgns.json'));
  let html = await read('j1939_converter/j1939_converter.html');
  const declaration = `const pgnDatabase = ${JSON.stringify(catalog)};`;
  const start = '// TOOLKIT:DATA:j1939-pgns:START';
  const end = '// TOOLKIT:DATA:j1939-pgns:END';
  const generated = `${start}\n${declaration}\n${end}`;
  const generatedPattern = /\/\/ TOOLKIT:DATA:j1939-pgns:START[\s\S]*?\/\/ TOOLKIT:DATA:j1939-pgns:END/;
  if (generatedPattern.test(html)) {
    html = html.replace(generatedPattern, generated);
  } else {
    const existingDeclaration = /const\s+pgnDatabase\s*=\s*\[\n[\s\S]*?\n\s{8}\];/;
    if (!existingDeclaration.test(html)) throw new Error('J1939 pgnDatabase declaration was not found.');
    html = html.replace(existingDeclaration, generated);
  }
  await write('j1939_converter/j1939_converter.html', html);
}

await synchronizeLauncher();
await embedOfflinePolicy();
await embedRuntimes();
await embedThree();
await embedJ1939Catalog();
await embedTheme();
await embedThemeToggle();
await embedBackLink();
