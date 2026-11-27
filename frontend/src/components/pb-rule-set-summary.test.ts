import { afterEach, expect, test, vi } from 'vitest';
import type { CompletedRuleSet } from '../api/client';
import { Router, ruleSetPath } from '../views/router';
import type { RuleSetChip } from './pb-rule-set-chip';
import { RuleSetSummary } from './pb-rule-set-summary';
import type { Tooltip } from './pb-tooltip';

const repositoryHref = '/repositories/acme%2Fproject';
const baseline = {
  source: 'github.com/acme/rules', path: 'sets/baseline', id: 'baseline',
  name: 'Original repository baseline', version: '0.9',
};
const security = {
  ...baseline, path: 'sets/security', id: 'security', version: '2.0',
  name: '<img src=x> Security readiness for repositories with additional compliance requirements',
};

async function mount(sets: readonly CompletedRuleSet[], href?: string) {
  const summary = new RuleSetSummary();
  summary.sets = sets;
  summary.href = href;
  document.body.append(summary);
  await summary.updateComplete;
  return summary;
}

async function controls(summary: RuleSetSummary) {
  const root = summary.shadowRoot!;
  const tooltip = root.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const chips = [...root.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
  await Promise.all(chips.map(chip => chip.updateComplete));
  return {
    trigger: root.querySelector<HTMLElement>('.chip')!,
    popup: tooltip.shadowRoot!.querySelector<HTMLElement>('[popover]')!,
    hoverArea: tooltip.shadowRoot!.querySelector('span')!,
    links: chips.map(chip => chip.shadowRoot!.querySelector('a')!),
  };
}

function tap(target: Element) {
  return target.dispatchEvent(new PointerEvent('click', {
    pointerType: 'touch', bubbles: true, composed: true, cancelable: true,
  }));
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Verifies REQ-0028.
test('omits an empty summary and uses the singular for one completed set', async () => {
  const summary = await mount([]);
  expect(summary.shadowRoot!.children).toHaveLength(0);

  summary.sets = [baseline];
  await summary.updateComplete;
  const { links, trigger } = await controls(summary);
  expect(trigger.tagName).toBe('BUTTON');
  expect(trigger.textContent).toBe('1 Rule Set');
  expect(links[0].getAttribute('href')).toBe(ruleSetPath(baseline, '0.9'));
});

// Verifies REQ-0004, REQ-0028 and REQ-0029.
test('shows the count and links each escaped name to its bound version', async () => {
  const summary = await mount([baseline, security], repositoryHref);
  const { links, trigger } = await controls(summary);
  expect(trigger.textContent).toBe('2 Rule Sets');
  expect(links.map(link => [link.textContent, link.getAttribute('href')])).toEqual(
    [baseline, security].map(set => [`${set.name} · v${set.version}`, ruleSetPath(set, set.version)]),
  );
  expect(links[1].querySelector('img')).toBeNull();
});

test('keeps links reachable from the keyboard, restores focus on Escape and dismisses on focus exit', async () => {
  const summary = await mount([baseline, security], repositoryHref);
  const { trigger, popup, links } = await controls(summary);
  const outside = document.createElement('button');
  document.body.append(outside);

  trigger.focus();
  expect(popup.hidden).toBe(false);
  for (const link of links) {
    link.focus();
    expect(popup.hidden).toBe(false);
    expect(link.tabIndex).toBe(0);
  }

  links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  expect(popup.hidden).toBe(true);
  expect(summary.shadowRoot!.activeElement).toBe(trigger);
  outside.focus();
  trigger.focus();
  expect(popup.hidden).toBe(false);
  outside.focus();
  expect(popup.hidden).toBe(true);
});

test('keeps the preview open while the pointer is inside it and dismisses when it leaves', async () => {
  vi.useFakeTimers();
  const { trigger, popup, hoverArea } = await controls(await mount([baseline], repositoryHref));
  hoverArea.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  vi.advanceTimersByTime(100);
  expect(popup.hidden).toBe(false);

  popup.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));
  trigger.focus();
  trigger.blur();
  vi.advanceTimersByTime(60_000);
  expect(popup.hidden).toBe(false);
  hoverArea.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  expect(popup.hidden).toBe(true);
});

test('opens on the first touch tap and follows the selected link on the next tap', async () => {
  const summary = await mount([baseline, security], repositoryHref);
  const { trigger, popup, links } = await controls(summary);
  const navigate = vi.fn();
  const router = new Router(summary, navigate);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  router.connect();
  try {
    navigate.mockClear();
    expect(tap(trigger)).toBe(false);
    expect(popup.hidden).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    tap(links[1]);
    expect(navigate).toHaveBeenLastCalledWith(ruleSetPath(security, security.version), undefined, false);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(popup.hidden).toBe(true);
    tap(trigger);
    tap(trigger);
    expect(navigate).toHaveBeenLastCalledWith(repositoryHref, undefined, false);
  } finally {
    router.disconnect();
  }
});
