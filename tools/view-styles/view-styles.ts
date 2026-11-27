import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const frontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { parse } = frontend('postcss') as typeof import('postcss');

const visual = /^(?:border(?:-.+)?|background(?:-.+)?|box-shadow|text-shadow|color|font|font-size|font-weight)$/;

export interface Exception {
  file: string;
  selector: string;
  reason: string;
}

export interface Finding {
  file: string;
  selector: string;
  property: string;
  line: number;
}

export function findings(file: string, source: string): Finding[] {
  const found: Finding[] = [];
  for (const match of source.matchAll(/\bcss`([^`]*)`/g)) {
    const css = match[1].replace(/\$\{[^}]*\}/g, expression => expression.replace(/[^\n]/g, ' '));
    const start = source.slice(0, match.index + 'css`'.length).split('\n').length - 1;
    parse(css).walkDecls(declaration => {
      if (!visual.test(declaration.prop) || declaration.parent?.type !== 'rule') return;
      found.push({
        file,
        selector: (declaration.parent as import('postcss').Rule).selector.replace(/\s+/g, ' '),
        property: declaration.prop,
        line: start + (declaration.source?.start?.line ?? 1),
      });
    });
  }
  return found;
}

export function viewSources(directory: string) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort()
    .map(name => ({ file: name, source: readFileSync(join(directory, name), 'utf8') }));
}

export function unexplained(all: Finding[], exceptions: Exception[]) {
  return all.filter(({ file, selector }) => !exceptions.some(entry => entry.file === file && entry.selector === selector));
}

export function unused(all: Finding[], exceptions: Exception[]) {
  return exceptions.filter(entry => !all.some(({ file, selector }) => entry.file === file && entry.selector === selector));
}
