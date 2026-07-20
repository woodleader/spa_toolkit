import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { escapeAttribute, escapeHtml } from '../scripts/runtime/safe-document.mjs';
import { createWorkspace } from '../scripts/runtime/workspace.mjs';
import { calculateChannelBudget, solveCoefficients } from '../scripts/runtime/channel-budget.mjs';
import { applyRadialDistortion, calculateDesiccant, calculateGroundFov, calculateLatency, calculateReactionScenario, calculateSensorTopFootprint } from '../scripts/runtime/engineering-kernels.mjs';

test('safe document interface neutralizes executable markup', () => {
  assert.equal(escapeHtml('</textarea><img src=x onerror=alert(1)>'), '&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeAttribute('" onfocus="alert(1)'), '&quot; onfocus=&quot;alert(1)');
});

test('workspace interface migrates and validates persisted state', () => {
  const memory = new Map([['example', JSON.stringify({ version: 1, data: { value: '4' } })]]);
  const adapter = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const workspace = createWorkspace({
    key: 'example', version: 2, adapter, fallback: { value: 0 },
    migrations: { 1: data => ({ value: Number(data.value) }) },
    validate: data => Number.isFinite(data?.value)
  });
  assert.deepEqual(workspace.load(), { value: 4 });
  workspace.save({ value: 7 });
  assert.deepEqual(JSON.parse(memory.get('example')), { version: 2, data: { value: 7 } });
});

test('workspace interface migrates legacy unversioned data', () => {
  const memory = new Map([['legacy', JSON.stringify({ rows: [] })]]);
  const adapter = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const workspace = createWorkspace({ key: 'legacy', version: 1, adapter, fallback: { rows: [] }, migrations: { 0: data => data }, validate: data => Array.isArray(data?.rows) });
  assert.deepEqual(workspace.load(), { rows: [] });
  assert.deepEqual(JSON.parse(memory.get('legacy')), { version: 1, data: { rows: [] } });
});

test('channel budget has one deterministic calculation interface', () => {
  const coefficients = solveCoefficients(1000, 0.5, 4000, 1.4);
  assert.equal(coefficients.valid, true);
  const result = calculateChannelBudget({
    frequencyGHz: 2, temperatureC: 20, temperatureReferenceC: 20, temperatureCoefficient: 0.002,
    segments: [{ lengthM: 5, a: coefficients.a, b: coefficients.b }],
    connectors: { count: 2, baseLossDb: 0.1, referenceFrequencyGHz: 2 },
    pcb: { lengthCm: 10, lossDbPerCm: 0.02, referenceFrequencyGHz: 2 },
    safetyMarginDb: 1, equalizerLimitDb: -12
  });
  assert.equal(result.totalLossDb.toFixed(2), '5.52');
  assert.equal(result.remainingMarginDb.toFixed(2), '6.48');
});

test('engineering kernels reproduce known reference scenarios', () => {
  const desiccant = calculateDesiccant({ sealingTemperatureC: 25, relativeHumidityPct: 60, volumeL: 1, minimumTemperatureC: -20, absorptionGPerG: 0.2, safetyFactor: 1.5 });
  assert.equal(desiccant.dewPointC.toFixed(1), '16.7');
  assert.equal(desiccant.foggingStatus, 'danger');
  const reaction = calculateReactionScenario({ speedKmh: 50, distanceM: 35, reactionTimeS: 0.75, brakeDelayMs: 200, decelerationMps2: 6.5, warningMode: 'ttc', warningThreshold: 2 });
  assert.equal(reaction.canAvoid, false);
  assert.equal(reaction.warningDelayS.toFixed(2), '0.52');
  const latency = calculateLatency({ fps: 25, ecuLatencyMs: 20, monitorLatencyMs: 10, vehicleSpeedKmh: 90 });
  assert.equal(latency.sensorLatencyMs, 40);
  assert.equal(latency.totalLatencyMs, 70);
  assert.equal(latency.positionOffsetM.toFixed(2), '1.75');
  assert.deepEqual(applyRadialDistortion(100, 0, { resolutionWidth: 1000, resolutionHeight: 1000, distortionK: 0 }), { x: 100, y: 0 });
  const fov = calculateGroundFov({ cameraHeightM: 1, cameraTiltRad: Math.PI / 4, horizontalFovRad: Math.PI / 2, verticalFovRad: Math.PI / 4 });
  assert.equal(fov.nearDistanceM.toFixed(3), '0.414');
  const footprint = calculateSensorTopFootprint({ x: 2, y: 0, orientationDeg: 0, fieldOfViewDeg: 60, rangeM: 10 });
  assert.equal(footprint.originY, -2);
  assert.equal(footprint.startX.toFixed(3), '-5.000');
});

test('ground FOV preserves the near footprint when the camera sees beneath itself', () => {
  const result = calculateGroundFov({
    cameraHeightM: 1.5,
    cameraTiltRad: Math.PI / 2,
    horizontalFovRad: Math.PI / 2,
    verticalFovRad: Math.PI / 3
  });
  assert.equal(result.nearDistanceM, 0);
  assert.ok(Math.abs(result.nearWidthM - 3) < 1e-12);
});

test('manifest describes exactly the deployed launcher entries', async () => {
  const manifest = JSON.parse(await readFile(new URL('../tool-manifest.json', import.meta.url)));
  assert.equal(manifest.tools.length, 20);
  assert.equal(new Set(manifest.tools.map(tool => tool.id)).size, 20);
  assert.equal(new Set(manifest.tools.map(tool => tool.path)).size, 20);
});

test('generated README inventory is valid Markdown without patch artifacts', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /\n## Tool inventory\n\n\| Tool \| Entry \| Tags \|/);
  assert.doesNotMatch(readme, /^\+(?:##|\||Generated)/m);
});

test('GitHub Actions use Node 24 action runtimes', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
});

test('deployed pages call the shared calculation and persistence interfaces', async () => {
  const files = await Promise.all([
    'fpdlink_loss/fpdlink_loss.html', 'gmsl2_loss/gmsl2_loss.html',
    'desiccant_calc/desiccant_calc.html', 'driver_reaction_time/driver_reaction_time.html',
    'pixel_estimator/pixel_estimator.html', 'glass_latency/glass_latency.html',
    'adas_sensor_fov/adas_sensor_fov.html', 'fmea/fmea.html',
    'fakra_cables/fakra_cables.html', 'md5check/md5check.html'
  ].map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  assert.match(files[0], /ToolboxChannelBudget\.calculateChannelBudget/);
  assert.match(files[1], /ToolboxChannelBudget\.calculateChannelBudget/);
  assert.match(files[2], /ToolboxEngineeringKernels\.calculateDesiccant\(/);
  for (const html of files.slice(2, 7)) assert.match(html, /ToolboxEngineeringKernels\./);
  for (const html of [files[0], files[1], ...files.slice(7)]) assert.match(html, /ToolboxWorkspace\.createWorkspace/);
});

test('deployed 3D viewer embeds its runtime dependencies', async () => {
  const html = await readFile(new URL('../plot_3d/plot_3d.html', import.meta.url), 'utf8');
  assert.match(html, /data-vendored-runtime="three-r128"/);
  assert.match(html, /data-vendored-runtime="orbit-controls-r128"/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
});
