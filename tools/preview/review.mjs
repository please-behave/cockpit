import { measure, queryDeep, themes, viewportHeight, widths } from './review-metrics.mjs';

const columns = [
  ['visible', 'Visible'],
  ['header', 'Header'],
  ['toolbar', 'Toolbar'],
  ['wrapped', 'Wrapped'],
  ['overflow', 'Overflow'],
];
const table = document.querySelector('table');
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

function addCase(reviewCase, index) {
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

  const jobs = cases.flatMap(addCase);
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
  status.textContent = failed
    ? `Measured ${jobs.length - failed} of ${jobs.length} previews. See the table for failures.`
    : `Measured all ${jobs.length} previews.`;
}

showReview().catch(error => { status.textContent = error.message; });
