export const viewportHeight = 900;
export const widths = [1440, 1024, 640, 320];
export const themes = ['light', 'dark'];

/** Query each open root once, without mixing selectors across shadow boundaries. */
export function queryDeep(root, selector) {
  const matches = [...root.querySelectorAll(selector)];
  if (root.shadowRoot) matches.push(...queryDeep(root.shadowRoot, selector));
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot) matches.push(...queryDeep(element.shadowRoot, selector));
  }
  return matches;
}

export function composedParent(element) {
  return element.assignedSlot ?? element.parentElement ?? element.getRootNode().host;
}

export function children(node) {
  if (node.localName === 'slot') {
    const assigned = node.assignedNodes();
    if (assigned.length) return assigned;
  }
  return (node.shadowRoot ?? node).childNodes;
}

/** Compare fractional coordinates with the same precision used in the displayed heights. */
export function fullyVisible(rect, top, bottom) {
  return rect.height > 0 && Math.round(rect.top * 100) >= Math.round(top * 100)
    && Math.round(rect.bottom * 100) <= Math.round(bottom * 100);
}

function visibleInViewport(entry, height, styleFor) {
  let top = 0;
  let bottom = height;
  for (let parent = composedParent(entry); parent; parent = composedParent(parent)) {
    if (parent.localName === 'html' || parent.localName === 'body') break;
    if (styleFor(parent).overflowY === 'visible') continue;
    const innerTop = parent.getBoundingClientRect().top + parent.clientTop;
    top = Math.max(top, innerTop);
    bottom = Math.min(bottom, innerTop + parent.clientHeight);
  }
  return fullyVisible(entry.getBoundingClientRect(), top, bottom);
}

export function spansLines(rects) {
  let latestTop = -Infinity;
  let earliestBottom = Infinity;
  for (const { top, bottom, width } of rects) {
    if (width <= 0 || bottom <= top) continue;
    latestTop = Math.max(latestTop, top);
    earliestBottom = Math.min(earliestBottom, bottom);
  }
  return latestTop >= earliestBottom;
}

/** Group text fragments within each flow of inline text, so stacked fields do not count as wrapping. */
function wraps(entry, styleFor) {
  const lines = new Map();
  const range = entry.ownerDocument.createRange();
  function visit(node, flow) {
    if (node.nodeType === 3) {
      if (!/\S/.test(node.data)) return;
      range.selectNodeContents(node);
      lines.get(flow).push(...range.getClientRects());
      return;
    }
    if (node.nodeType !== 1 || node.namespaceURI !== entry.namespaceURI) return;
    const { display, visibility, position } = styleFor(node);
    if (display === 'none' || visibility !== 'visible' || position === 'absolute' || position === 'fixed') return;
    if (node === entry || !['inline', 'contents'].includes(display)) {
      flow = node;
      lines.set(flow, []);
    }
    for (const child of children(node)) visit(child, flow);
  }
  visit(entry, entry);
  return [...lines.values()].some(spansLines);
}

export function measure(document, entries) {
  const page = document.documentElement;
  const shell = queryDeep(document, 'pb-app-shell')[0]?.shadowRoot;
  const height = selector => {
    const rect = shell?.querySelector(selector)?.getBoundingClientRect();
    return rect ? Math.round(rect.height * 100) / 100 : 0;
  };
  const styles = new WeakMap();
  function styleFor(element) {
    if (!styles.has(element)) styles.set(element, document.defaultView.getComputedStyle(element));
    return styles.get(element);
  }
  const rendered = entries.filter(entry => entry.getBoundingClientRect().height > 0
    && styleFor(entry).visibility === 'visible');
  return {
    visible: rendered.filter(entry => visibleInViewport(entry, Math.min(viewportHeight, page.clientHeight), styleFor)).length,
    header: height('header'),
    toolbar: height('.toolbar'),
    wrapped: rendered.filter(entry => wraps(entry, styleFor)).length,
    overflow: Math.max(0, page.scrollWidth - page.clientWidth),
  };
}
