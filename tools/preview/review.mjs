import { measure, queryDeep, themes, viewportHeight, widths } from './review-metrics.mjs';
import { inventory } from './review-inventory.mjs';

const columns = [
  ['visible', 'Visible'],
  ['header', 'Header'],
  ['toolbar', 'Toolbar'],
  ['wrapped', 'Wrapped'],
  ['overflow', 'Overflow'],
];
const table = document.querySelector('#measurements');
const views = document.querySelector('#views');
const status = document.querySelector('#status');

function add(parent, tag, text = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

async function measureFrame(frame, reviewCase, theme) {
  const loaded = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Frame did not load')), 30_000);
    frame.addEventListener('load', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  frame.src = reviewCase.path;
  await loaded;
  const document = frame.contentDocument;
  if (!document || document.URL === 'about:blank') throw new Error('Frame unavailable');
  document.documentElement.dataset.theme = theme;

  // The shell loads before some views finish their fixture requests and render their rows.
  const deadline = performance.now() + (reviewCase.heavy ? 90_000 : 15_000);
  while (performance.now() < deadline) {
    const root = queryDeep(document, reviewCase.root)[0];
    if (root) {
      const entries = queryDeep(root, reviewCase.selector);
      if (entries.length) {
        await document.fonts.ready;
        return measure(document, entries);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Fixture entries did not render');
}

function addCase(reviewCase, index, inventories) {
  const { name, path, entries, heavy } = reviewCase;
  const id = `view-${index + 1}`;
  const section = add(views, 'section');
  const heading = add(section, 'h2', name);
  heading.id = id;
  const description = add(section, 'p', `${entries}. `);
  add(description, 'a', 'Open preview').href = path;
  const frames = add(section, 'div');
  frames.className = 'frames scroll';
  frames.tabIndex = 0;
  frames.setAttribute('role', 'region');
  frames.setAttribute('aria-labelledby', id);

  const body = add(table, 'tbody');
  return widths.flatMap((width, rowIndex) => {
    const row = body.insertRow();
    if (rowIndex === 0) {
      const label = add(row, 'th');
      label.scope = 'rowgroup';
      label.rowSpan = widths.length;
      add(label, 'a', name).href = `#${id}`;
    }
    add(row, 'th', width).scope = 'row';
    return themes.map(theme => {
      const cells = columns.map(() => add(row, 'td', '…'));
      const figure = add(frames, 'figure');
      add(figure, 'figcaption', `${width} px · ${theme}`);
      const frame = add(figure, 'iframe');
      frame.title = `${name}, ${width} pixels, ${theme}`;
      frame.width = width;
      frame.height = viewportHeight;
      const run = async () => {
        try {
          const result = await measureFrame(frame, reviewCase, theme);
          columns.forEach(([key], index) => { cells[index].textContent = result[key]; });
          const sample = heavy ? width === widths.at(-1) && theme === themes[0]
            : width === widths[0] || width === widths.at(-1);
          if (sample) {
            // Allow the frame to paint and any size-dependent tooltips to render before probing.
            await new Promise(resolve => setTimeout(resolve, 50));
            const report = await inventory(frame.contentDocument);
            inventories.push({ id, name, width, theme, ...report });
          }
          return true;
        } catch (error) {
          cells[0].colSpan = columns.length;
          cells[0].textContent = error.message;
          cells.slice(1).forEach(cell => cell.remove());
          return false;
        }
      };
      run.heavy = heavy;
      return run;
    });
  });
}

function showInventory(reports) {
  const target = document.querySelector('#inventory');
  const groups = new Map();
  const ordered = reports.sort((a, b) => a.name.localeCompare(b.name) || b.width - a.width
    || a.theme.localeCompare(b.theme));
  for (const { id, name, width, theme, groups: findings } of ordered) {
    for (const { category, name: form, example, count } of findings) {
      const entries = groups.get(category) ?? new Map();
      const key = JSON.stringify(category === 'Repeated popups' ? [form, example] : [form]);
      const item = entries.get(key) ?? { form, example, views: new Map() };
      const view = item.views.get(id) ?? { name, frames: [] };
      view.frames.push(`${width} ${theme} × ${count}`);
      item.views.set(id, view);
      entries.set(key, item);
      groups.set(category, entries);
    }
  }
  const count = ordered.reduce((total, report) => total + report.probed, 0);
  add(target, 'p', `${ordered.length} frames inventoried, ${count} interactive elements probed.`).id = 'inventory-summary';
  for (const category of ['Outcomes', 'Classifications', 'Object references', 'Time formats', 'Version formats',
    'Repeated popups']) {
    const items = [...(groups.get(category)?.values() ?? [])];
    const section = add(target, 'details');
    add(section, 'summary', `${category} (${items.length})`);
    const list = add(section, 'ul');
    for (const { form, example, views } of items.sort((a, b) => a.form.localeCompare(b.form)
      || a.example.localeCompare(b.example))) {
      const item = add(list, 'li');
      add(item, 'strong', form);
      item.append(` · ${example}`);
      const occurrences = add(item, 'ul');
      for (const [id, { name, frames }] of views) {
        const row = add(occurrences, 'li');
        add(row, 'a', name).href = `#${id}`;
        row.append(` (${frames.join(', ')})`);
      }
    }
  }
}

async function showReview() {
  const response = await fetch('/preview/review-cases.json');
  if (!response.ok) throw new Error('Preview cases unavailable');
  const cases = await response.json();
  const metrics = document.querySelector('#metrics');
  for (const theme of themes) {
    for (const [, label] of columns) {
      const heading = add(metrics, 'th', label);
      heading.scope = 'col';
      heading.setAttribute('aria-label', `${theme} ${label.toLowerCase()}`);
    }
  }

  const inventories = [];
  const jobs = cases.flatMap((reviewCase, index) => addCase(reviewCase, index, inventories));
  let failed = 0;
  // A batch keeps the initial rendering and API requests manageable. Heavy frames follow one at a time.
  const light = jobs.filter(run => !run.heavy);
  const batches = [...Array.from({ length: Math.ceil(light.length / 8) }, (_, index) => light.slice(index * 8, index * 8 + 8)),
    ...jobs.filter(run => run.heavy).map(run => [run])];
  let complete = 0;
  for (const batch of batches) {
    status.textContent = `Measuring previews (${complete} of ${jobs.length} complete)…`;
    const results = await Promise.all(batch.map(run => run()));
    failed += results.filter(result => !result).length;
    complete += batch.length;
  }
  showInventory(inventories);
  status.textContent = failed
    ? `Measured ${jobs.length - failed} of ${jobs.length} previews. See the table for failures.`
    : `Measured all ${jobs.length} previews.`;
}

showReview().catch(error => { status.textContent = error.message; });
