import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const check = fileURLToPath(new URL('./check.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'cockpit-safe-dom-'));
const file = join(root, 'components', 'fixture.ts');
mkdirSync(join(root, 'components'));
process.on('exit', () => rmSync(root, { recursive: true, force: true }));

function runCheck(source) {
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, [check, root], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

for (const [api, source] of [
  ['innerHTML', 'element.innerHTML = markup;'],
  ['outerHTML', 'element["outerHTML"] = markup;'],
  ['insertAdjacentHTML', 'element.insertAdjacentHTML("afterbegin", markup);'],
  ['document.write', 'document.write(markup);'],
  ['document.write', 'window.document?.["write"](markup);'],
  ['document.write', 'const { write: insert } = document;'],
  ['unsafeHTML', 'import { unsafeHTML as renderRaw } from "lit/directives/unsafe-html.js";'],
]) {
  test(`rejects ${source}`, () => {
    const result = runCheck(source);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(`fixture.ts:1: forbidden HTML API ${api}`), result.stderr);
  });
}

test('accepts safe rendering and ignores comments about forbidden APIs', () => {
  const result = runCheck('element.textContent = markup; // Never use innerHTML.');
  assert.equal(result.status, 0, result.stderr);
});

test('checks the cockpit frontend source', () => {
  const result = spawnSync(process.execPath, [check], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
