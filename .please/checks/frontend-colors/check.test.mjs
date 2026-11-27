import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const check = fileURLToPath(new URL('./check.mjs', import.meta.url));
const frontend = createRequire(new URL('../../../frontend/package.json', import.meta.url));
const { parse } = frontend('postcss');

function runCheck(root) {
  const result = spawnSync(process.execPath, root ? [check, root] : [check], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('the cockpit source uses tokens for colors', () => {
  const result = runCheck();
  assert.equal(result.status, 0, result.stderr);
});

test('rejects literals in styles and component code outside the tokens layer', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'cockpit-colors-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'styles'));
  writeFileSync(join(root, 'styles', 'tokens.css'), `
@layer tokens { :root { --surface: #fff; } }
@layer base { body { background: hsl(0 0% 100%); } }
`);
  writeFileSync(join(root, 'component.ts'), `
const styles = css\`a { color: rebeccapurple; background: #ff000080; }\`;
const foreground = 'oklch(0.2 0.1 90)';
const background = 'rgb(1 2 3)';
`);

  const result = runCheck(root);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /tokens\.css:3: color literal hsl\(/);
  assert.match(result.stderr, /component\.ts:2: color literal rebeccapurple/);
  assert.match(result.stderr, /component\.ts:2: color literal #ff000080/);
  assert.match(result.stderr, /component\.ts:3: color literal oklch\(/);
  assert.match(result.stderr, /component\.ts:4: color literal rgb\(/);
  assert.ok(!result.stderr.includes('#fff'), result.stderr);
});

function luminance(value) {
  assert.match(value, /^#[\da-f]{6}$/i);
  const channels = value.slice(1).match(/../g).map((pair) => {
    const channel = Number.parseInt(pair, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

// Verifies REQ-0015 using the shared palette from why:DEC-0028.
test('declared token pairings meet the shared contrast minimums in both themes and use system colors when forced', () => {
  const path = new URL('../../../frontend/src/styles/tokens.css', import.meta.url);
  const stylesheet = parse(readFileSync(path, 'utf8'));
  const light = new Map();
  const dark = new Map();
  const forcedColors = new Map();
  const densityTokens = new Set([
    '--type-data', '--type-meta', '--cell-padding-block', '--control-padding-block',
    '--control-padding-inline', '--panel-padding', '--target-min-size',
  ]);
  stylesheet.walkDecls(/^--/, ({ prop, value, parent }) => {
    const scope = parent.parent;
    if (parent.selector === ':root' && scope.name === 'media' && scope.params === '(forced-colors: active)') {
      forcedColors.set(prop, value);
      return;
    }
    if (parent.selector === ':root' && scope.name === 'media' && scope.params === '(pointer: coarse)') {
      assert.ok(densityTokens.has(prop), `${prop} is not a density token`);
      return;
    }
    if (prop === '--logo-light-display' || prop === '--logo-dark-display') return;
    assert.ok(parent.selector === ':root' && scope.name === 'layer' && scope.params === 'tokens',
      `${prop} belongs in the root tokens`);
    assert.ok(!light.has(prop), `${prop} has one declaration outside forced colors`);
    const pair = value.match(/^light-dark\(([^,]+),\s*([^,]+)\)$/);
    light.set(prop, pair ? pair[1].trim() : value);
    dark.set(prop, pair ? pair[2].trim() : value);
  });

  const darkLogo = readFileSync(new URL('../../../frontend/brand/logo-dark.svg', import.meta.url), 'utf8');
  const darkLogoOutline = darkLogo.match(/stroke="(#[\da-f]{6})"/i)?.[1];
  assert.ok(darkLogoOutline, 'the dark logo has a visible outline');
  const textTokens = [
    'text', 'text-muted', 'accent-link', 'accent-link-hover', 'status-passed',
    'status-failed', 'status-error', 'status-warning', 'status-not-run', 'status-allowed',
  ];
  for (const [theme, tokens] of [
    ['light', light],
    ['dark', dark],
  ]) {
    function token(name) {
      const value = tokens.get(`--${name}`);
      assert.ok(value, `${theme} is missing the ${name} token`);
      const alias = value.match(/^var\(--([\w-]+)\)$/)?.[1];
      return alias ? token(alias) : value;
    }
    function assertContrast(foreground, background, minimum) {
      const value = foreground.startsWith('#') ? foreground : token(foreground);
      const [a, b] = [luminance(value), luminance(token(background))];
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= minimum, `${theme} ${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`);
    }

    for (const surface of ['surface', 'surface-raised', 'surface-hover', 'badge-surface', 'panel-surface']) {
      for (const text of textTokens) assertContrast(text, surface, 4.5);
      for (const boundary of ['border', 'accent-focus', 'accent-fill']) assertContrast(boundary, surface, 3);
    }
    for (const surface of ['surface', 'surface-raised']) {
      assertContrast('badge-border', surface, 3);
      if (theme === 'dark') assertContrast(darkLogoOutline, surface, 3);
    }
    assertContrast('accent-text', 'accent-fill', 4.5);
    assert.equal(tokens.get('--focus-ring'), '0.125rem solid var(--accent-focus)');
    assertContrast('badge-border', 'badge-surface', 3);
    for (const tone of ['check', 'review', 'blocking', 'neutral']) {
      assertContrast(`chip-${tone}-text`, `chip-${tone}-surface`, 4.5);
      assertContrast(`chip-${tone}-border`, `chip-${tone}-surface`, 3);
      for (const surface of ['surface', 'surface-raised']) {
        assertContrast(`chip-${tone}-border`, surface, 3);
        assertContrast(`chip-${tone}-text`, surface, 4.5);
      }
    }
    assert.equal(tokens.get('--panel-border'), 'var(--border-subtle)');
    for (const surface of ['surface', 'surface-raised']) {
      assert.ok(luminance(token('nav-hover-surface')) < luminance(token(surface)),
        `${theme} navigation hover darkens ${surface}`);
    }
    assertContrast('accent-link-hover', 'nav-hover-surface', 4.5);
    assertContrast('border', 'nav-hover-surface', 3);
    assertContrast('accent-focus', 'nav-hover-surface', 3);
  }

  for (const [name, systemColor] of [
    ['accent-link', 'LinkText'],
    ['accent-link-hover', 'LinkText'],
    ['nav-hover-surface', 'Canvas'],
    ['focus-ring', '0.125rem solid Highlight'],
    ['surface-hover', 'Canvas'],
    ['badge-surface', 'Canvas'],
    ['badge-border', 'CanvasText'],
    ['panel-surface', 'Canvas'],
    ['border', 'CanvasText'],
    ['border-subtle', 'CanvasText'],
    ...['check', 'review', 'blocking', 'neutral'].flatMap(tone => [
      [`chip-${tone}-surface`, 'Canvas'],
      [`chip-${tone}-text`, 'CanvasText'],
      [`chip-${tone}-border`, 'CanvasText'],
    ]),
  ]) {
    assert.equal(forcedColors.get(`--${name}`), systemColor, `forced colors for ${name}`);
  }
});
