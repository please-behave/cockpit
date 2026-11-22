import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('builds a hashed frontend entry and assets', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cockpit-build-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('npm', ['--prefix', 'frontend', 'run', 'build', '--', '--outDir', directory, '--emptyOutDir'], {
    stdio: 'inherit',
  });

  const index = readFileSync(join(directory, 'index.html'), 'utf8');
  const entry = index.match(/<script[^>]+src="\/assets\/([^"]+)"/)?.[1];
  assert.ok(entry, 'expected an external entry script');
  const assets = readdirSync(join(directory, 'assets'));
  assert.ok(assets.includes(entry));
  for (const asset of assets) {
    assert.match(asset, /-[\w-]{8,}\.[^.]+$/);
  }
});
