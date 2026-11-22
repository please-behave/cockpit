import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const frontend = createRequire(new URL('../../../frontend/package.json', import.meta.url));
const { parse } = frontend('postcss');
const { transform } = frontend('lightningcss');

const literal = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?|hwb|(?:ok)?lab|(?:ok)?lch|color|device-cmyk)\(/gi;

const root = process.argv[2] ?? 'frontend/src';
for (const file of globSync('**/*.{css,ts,tsx,mts,cts,js,jsx,mjs,cjs,html,svg}', { cwd: root }).sort()) {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');

  function report(offset, value) {
    const line = source.slice(0, offset).split('\n').length;
    console.error(`${path}:${line}: color literal ${value} belongs in the tokens layer`);
    process.exitCode = 1;
  }

  function checkText(text, offset = 0) {
    for (const match of text.matchAll(literal)) report(offset + match.index, match[0]);
  }

  function checkStyles(css, offset = 0) {
    const stylesheet = parse(css, { from: path });
    if (file === 'styles/tokens.css') {
      stylesheet.each((node) => {
        if (node.type === 'atrule' && node.name === 'layer' && node.params === 'tokens' && node.nodes) {
          node.remove();
        }
      });
    }

    stylesheet.walkDecls((declaration) => {
      const start = offset + declaration.source.start.offset;
      const valueStart = start + declaration.prop.length + declaration.raws.between.length;
      checkText(declaration.value, valueStart);
      if (declaration.value.match(literal)) return;

      let namedColor = false;
      transform({
        filename: path,
        code: Buffer.from(`a { ${declaration.prop}: ${declaration.value} }`),
        errorRecovery: true,
        visitor: {
          Color(color) {
            if (color.type !== 'currentcolor') namedColor = true;
          },
        },
      });
      if (namedColor) report(start, declaration.value);
    });
  }

  if (file.endsWith('.css')) {
    checkStyles(source);
    continue;
  }

  let end = 0;
  for (const match of source.matchAll(/\bcss`([^`]*)`/g)) {
    checkText(source.slice(end, match.index), end);
    // Lit interpolations supply already-defined style values, not CSS syntax.
    const start = match.index + 'css`'.length;
    const css = match[1].replace(/\$\{[^}]*\}/g, (expression, offset) => {
      checkText(expression, start + offset);
      return expression.replace(/[^\n]/g, ' ');
    });
    checkStyles(css, start);
    end = match.index + match[0].length;
  }
  checkText(source.slice(end), end);
}
