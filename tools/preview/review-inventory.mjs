import { children, composedParent } from './review-metrics.mjs';

const controls = 'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]';
const visitedElements = new Set(['script', 'style', 'svg', 'template']);
const versionNumber = /(?:v)?[0-9]+(?:\.[0-9]+)+(?:[-+][\w.-]+)?$/i;
const normalize = text => text.trim().replace(/\s+/g, ' ');
const localTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' });

function* rendered(root) {
  for (const element of children(root)) {
    if (element.nodeType !== 1 || visitedElements.has(element.localName) || element.hidden) continue;
    yield element;
    yield* rendered(element);
  }
}

function visible(element, style) {
  return element.getClientRects().length > 0 && style(element).visibility === 'visible'
    && !element.matches('.assistive, option');
}

function label(element) {
  const selected = element.selectedOptions?.[0];
  if (selected) return normalize(selected.textContent);
  function read(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1 || node.hidden || visitedElements.has(node.localName)
        || node.matches('.assistive')) return '';
    const separator = node.matches('div, p, li, dd, dt') ? ' ' : '';
    return separator + [...children(node)].map(read).join('') + separator;
  }
  return normalize(read(element));
}

function objectType(element) {
  const target = element.pathname;
  if (target === '/rules/detail') return 'Rule';
  if (target === '/rule-sets/detail') return 'Rule Set';
  if (target === '/repositories/detail' || target === '/releases/repository') return 'Repository';
  if (target === '/releases/detail') return 'Release';
  if (/^\/attestations\/[^/]+$/.test(target ?? '')) return 'Attestation';
}

function form(element) {
  if (element.matches('.pill') && element.getRootNode().host?.matches('pb-status-pill')) {
    return ['Outcomes', 'Status pill'];
  }
  if (element.matches('.status, .health') && element.getRootNode().host?.matches('pb-needs-attention, pb-repo-chip')) {
    return ['Outcomes', 'Repository health'];
  }
  if (element.matches('pb-badge')) return ['Classifications', element.getAttribute('tone') ?? 'Plain badge'];
  if (element.matches('.chip') && element.getRootNode().host?.matches('pb-rule-set-summary')) {
    return ['Object references', 'Rule Set summary'];
  }
  const type = objectType(element);
  if (type) return ['Object references', type];
}

function border(style) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Style`] === 'none'
    ? 'none'
    : `${style[`border${side}Width`]} ${style[`border${side}Style`]} ${style[`border${side}Color`]}`);
  return new Set(sides).size === 1 ? sides[0] : sides.join(' / ');
}

function versionFormat(text, version) {
  if (!version || !text.endsWith(version)) return 'no version';
  const prefix = text.slice(0, -version.length);
  const separator = prefix.endsWith(' · ') ? 'middle dot' : prefix === 'Version ' ? 'Version label'
    : prefix.endsWith(' ') ? 'space' : prefix ? 'other separator' : 'standalone';
  return `${separator}${version.startsWith('v') ? ', v prefix' : ''}`;
}

function timeFormat(element, text, host) {
  if (host?.matches('pb-refresh-status')) return 'Refresh age';
  if (/(?:\bago|^just now$)/.test(text)) return 'Relative';
  if (/^(?:\d+ (?:days?|hours?|minutes?)|less than a minute)$/.test(text)) return 'Duration';
  const date = new Date(element.getAttribute('datetime') ?? '');
  if (Number.isNaN(date.getTime())) return 'Unparsed';
  if (text === normalize(localTime.format(date))) return 'Local date and time with seconds and zone';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return 'ISO timestamp';
  return 'Other time format';
}

function collectFormats(element, add) {
  const type = objectType(element);
  const host = element.getRootNode().host;
  if (element.localName === 'time' || (element.localName === 'span' && host?.matches('pb-time, pb-relative-time'))) {
    const text = label(element);
    add('Time formats', timeFormat(element, text, host), text);
  } else if (element.matches('.version-field select')) {
    const text = label(element);
    add('Version formats', 'Version selector · local date and short time', text);
    add('Time formats', 'Local date and short time in version selector', text.split(' · ')[1]);
  } else if (type === 'Rule' || type === 'Rule Set') {
    const text = label(element);
    const version = text.match(versionNumber)?.[0];
    add('Version formats', `${type} · ${versionFormat(text, version)}`, text);
  } else if (type === 'Release' || (element.localName === 'h1' && host?.matches('pb-release'))
      || element.matches('[part="deployment-reference"] pb-tooltip[text-value] > span')) {
    const text = label(element);
    const format = /^v\d/i.test(text) && versionNumber.test(text) ? 'v prefix'
      : /^\d/.test(text) && versionNumber.test(text) ? 'number' : 'free text';
    add('Version formats', `Release · ${format}`, text);
  } else if (element.matches('h2, h3, .facts > span, .repositories li span')) {
    const text = label(element);
    if (/^Version v?\d/.test(text)) add('Version formats', 'Registry · Version label', text);
  }
}

function overflows(element, style) {
  return [element, ...rendered(element)].some(node => {
    const { overflowX, overflowY } = style(node);
    return (['hidden', 'clip'].includes(overflowX) && node.scrollWidth > node.clientWidth)
      || (['hidden', 'clip'].includes(overflowY) && node.scrollHeight > node.clientHeight);
  });
}

function focusForProbe(trigger, popup) {
  if (!popup) {
    trigger.focus?.({ preventScroll: true });
    return;
  }
  // Cockpit tooltips scroll their trigger into view on keyboard focus. During the
  // probe that would move parent frames and load more rows in paginated views.
  const original = Object.getOwnPropertyDescriptor(trigger, 'scrollIntoView');
  Object.defineProperty(trigger, 'scrollIntoView', { configurable: true, value: () => {} });
  try {
    trigger.focus({ preventScroll: true });
  } finally {
    if (original) Object.defineProperty(trigger, 'scrollIntoView', original);
    else delete trigger.scrollIntoView;
  }
}

export async function inventory(document) {
  const groups = new Map();
  const styles = new WeakMap();
  const style = element => {
    if (!styles.has(element)) styles.set(element, document.defaultView.getComputedStyle(element));
    return styles.get(element);
  };
  function add(category, name, example) {
    if (!example) return;
    const key = JSON.stringify(category === 'Repeated popups' ? [category, name, example] : [category, name]);
    const item = groups.get(key) ?? { category, name, example, count: 0 };
    item.count += 1;
    groups.set(key, item);
  }
  const seen = new Set();
  function collect(root) {
    const interactive = [];
    for (const element of rendered(root)) {
      if (seen.has(element) || !visible(element, style)) continue;
      seen.add(element);
      const entry = form(element);
      if (entry) {
        const [category, role] = entry;
        const css = style(element);
        const radius = [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius,
          css.borderBottomLeftRadius];
        const corners = new Set(radius).size === 1 ? radius[0] : radius.join(' / ');
        const reference = role === 'Repository' && element.closest('.repository-reference');
        const text = reference
          ? `${label(reference.querySelector('.repository-prefix'))}${label(element)}`
          : label(element);
        add(category, `${role} · radius ${corners} · border ${border(css)} · background ${css.backgroundColor} · weight ${css.fontWeight}`,
          text);
      }
      collectFormats(element, add);
      if (element.matches(controls) || element.hasAttribute('title')
          || (element.matches('.value') && element.getRootNode().host?.matches('pb-tooltip[text-value]'))) {
        interactive.push(element);
      }
    }
    return interactive;
  }
  const active = document.activeElement;
  const view = document.defaultView;
  const scroll = { top: view.scrollY, left: view.scrollX, behavior: 'instant' };
  const pending = [];
  let probed = 0;

  function inspect(trigger) {
    probed += 1;
    let wrapper;
    let title;
    for (let node = trigger; node; node = composedParent(node)) {
      if (node.matches('pb-tooltip')) {
        const target = node.shadowRoot?.firstElementChild;
        const control = node.hasAttribute('external-trigger')
          ? target?.querySelector('slot')?.assignedElements()[0] : target?.querySelector('button, .value');
        if (control === trigger) wrapper = target;
      }
      title ??= node.getAttribute('title') ?? undefined;
    }
    const popup = wrapper?.querySelector('[popover]');
    const visibleText = label(trigger);
    if (title && normalize(title) === visibleText && !overflows(trigger, style)) {
      add('Repeated popups', 'Native title', visibleText);
    }
    function pointer(type) {
      if (!wrapper) return;
      const rect = trigger.getBoundingClientRect();
      wrapper.dispatchEvent(new view.PointerEvent(type, {
        pointerType: 'mouse', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    }
    const readPopup = () => {
      if (!popup || popup.hidden) return false;
      const message = label(popup);
      if (message && message === visibleText && !overflows(trigger, style)) {
        add('Repeated popups', 'Cockpit popup', visibleText);
      }
      for (const control of collect(popup)) inspect(control);
      return true;
    };
    focusForProbe(trigger, popup);
    // Pointerenter is delivered separately to the trigger and its tooltip wrapper by the browser.
    trigger.dispatchEvent(new view.PointerEvent('pointerenter', { pointerType: 'mouse' }));
    pointer('pointerenter');
    if (!readPopup() && popup) {
      pending.push(() => { readPopup(); pointer('pointerleave'); });
    } else {
      pointer('pointerleave');
    }
    trigger.dispatchEvent(new view.PointerEvent('pointerleave', { pointerType: 'mouse' }));
    trigger.blur?.();
  }

  try {
    for (const trigger of collect(document.body)) {
      inspect(trigger);
      // Keep the sheet responsive while probing large fixture frames.
      if (probed % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    while (pending.length) {
      const waiting = pending.splice(0);
      await new Promise(resolve => setTimeout(resolve, 120));
      waiting.forEach(read => read());
    }
  } finally {
    active?.focus({ preventScroll: true });
    view.scrollTo(scroll);
  }
  return { probed, groups: [...groups.values()] };
}
