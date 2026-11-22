import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const command = ['--prefix', 'frontend', 'run', 'typecheck'];

test('checks the frontend in strict mode', (context) => {
  execFileSync('npm', command, { stdio: 'inherit' });

  const directory = mkdtempSync(join(tmpdir(), 'cockpit-typecheck-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, JSON.stringify({
    extends: resolve('frontend/tsconfig.json'),
    include: ['invalid.ts'],
  }));
  writeFileSync(join(directory, 'invalid.ts'), 'const title: string = null;');

  const result = spawnSync('npm', [...command, '--', '--project', config], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Type 'null' is not assignable to type 'string'/);
});
