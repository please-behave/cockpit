import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const frontend = createRequire(new URL('../../../frontend/package.json', import.meta.url));
const { parseSync, Visitor } = await import(frontend.resolve('vite'));

const forbidden = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'unsafeHTML']);

function propertyName(node, computed) {
  if (node.type === 'Identifier' && !computed) return node.name;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
}

function isDocument(node) {
  return (node?.type === 'Identifier' && node.name === 'document')
    || (node?.type === 'MemberExpression' && propertyName(node.property, node.computed) === 'document');
}

const root = process.argv[2] ?? 'frontend/src';
for (const file of globSync('**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', { cwd: root }).sort()) {
  const path = join(root, file);
  const code = readFileSync(path, 'utf8');
  const { program, errors } = parseSync(path, code);
  if (errors.length) {
    for (const error of errors) console.error(path, error.message);
    process.exitCode = 2;
    continue;
  }

  function report(node, api) {
    const line = code.slice(0, node.start).split('\n').length;
    console.error(`${path}:${line}: forbidden HTML API ${api}`);
    if (process.exitCode !== 2) process.exitCode = 1;
  }

  new Visitor({
    Identifier(node) {
      if (forbidden.has(node.name)) report(node, node.name);
    },
    MemberExpression(node) {
      const name = propertyName(node.property, node.computed);
      if (node.property.type !== 'Identifier' && forbidden.has(name)) report(node.property, name);
      if (name === 'write' && isDocument(node.object)) report(node.property, 'document.write');
    },
    VariableDeclarator(node) {
      if (node.id.type !== 'ObjectPattern' || !isDocument(node.init)) return;
      for (const property of node.id.properties) {
        if (property.type === 'Property' && propertyName(property.key, property.computed) === 'write') {
          report(property.key, 'document.write');
        }
      }
    },
    Literal(node) {
      if (typeof node.value === 'string' && /^lit(?:-html)?\/directives\/unsafe-html(?:\.js)?$/.test(node.value)) {
        report(node, 'unsafeHTML');
      }
    },
  }).visit(program);
}
