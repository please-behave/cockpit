import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('runs the frontend suite and records coverage', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'cockpit-coverage-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  execFileSync('npm', [
    '--prefix', 'frontend', 'test', '--',
    '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${directory}`,
  ], { stdio: 'inherit' });

  const coverage = JSON.parse(readFileSync(join(directory, 'coverage-summary.json'), 'utf8'));
  assert.ok(coverage.total.statements.covered > 0);
});
