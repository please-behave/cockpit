import { afterEach, expect, test, vi } from 'vitest';
import { Tooltip } from './pb-tooltip';

const description = 'The result could not be checked.';

async function mount() {
  const component = new Tooltip();
  component.description = description;
  component.textContent = 'Unverified';
  document.body.append(component);
  await component.updateComplete;
  const root = component.shadowRoot!;
  return {
    component,
    trigger: root.querySelector('button')!,
    tooltip: root.querySelector<HTMLElement>('[role="tooltip"]')!,
    hoverArea: root.querySelector('span')!,
  };
}

function pointer(target: Element, type: string, pointerType = 'mouse') {
  target.dispatchEvent(new PointerEvent(type, { pointerType, bubbles: type === 'click' }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Verifies REQ-0016 and REQ-0024.
test('opens after a short hover and stays open over its surface', async () => {
  vi.useFakeTimers();
  const { hoverArea, tooltip } = await mount();
  pointer(hoverArea, 'pointerenter');
  vi.advanceTimersByTime(99);
  expect(tooltip.hidden).toBe(true);
  vi.advanceTimersByTime(1);
  expect(tooltip.hidden).toBe(false);

  pointer(tooltip, 'pointerenter');
  vi.advanceTimersByTime(500);
  expect(tooltip.hidden).toBe(false);
  pointer(hoverArea, 'pointerleave');
  expect(tooltip.hidden).toBe(true);
});

test('keeps the explanation open when focus leaves while the pointer is over it', async () => {
  const { trigger, tooltip, hoverArea } = await mount();
  trigger.focus();
  pointer(hoverArea, 'pointerenter');
  trigger.blur();
  expect(tooltip.hidden).toBe(false);
  pointer(hoverArea, 'pointerleave');
  expect(tooltip.hidden).toBe(true);
});

test('cancels a pending hover on exit, Escape or removal', async () => {
  vi.useFakeTimers();
  const { component, hoverArea, tooltip } = await mount();
  pointer(hoverArea, 'pointerenter');
  pointer(hoverArea, 'pointerleave');
  vi.advanceTimersByTime(100);
  expect(tooltip.hidden).toBe(true);

  pointer(hoverArea, 'pointerenter');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  vi.advanceTimersByTime(100);
  expect(tooltip.hidden).toBe(true);

  pointer(hoverArea, 'pointerenter');
  component.remove();
  vi.advanceTimersByTime(100);
  expect(tooltip.hidden).toBe(true);
});

test('opens on keyboard focus, closes on Escape without moving focus, and closes on blur', async () => {
  const { component, trigger, tooltip } = await mount();
  trigger.focus();
  expect(tooltip.hidden).toBe(false);
  trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  expect(tooltip.hidden).toBe(true);
  expect(component.shadowRoot!.activeElement).toBe(trigger);
  trigger.blur();
  trigger.focus();
  expect(tooltip.hidden).toBe(false);
  trigger.blur();
  expect(tooltip.hidden).toBe(true);
});

test('toggles with a touch tap and dismisses on an outside press', async () => {
  vi.useFakeTimers();
  const { hoverArea, trigger, tooltip } = await mount();
  pointer(hoverArea, 'pointerenter', 'touch');
  vi.advanceTimersByTime(100);
  expect(tooltip.hidden).toBe(true);
  pointer(trigger, 'click', 'touch');
  expect(tooltip.hidden).toBe(false);
  pointer(trigger, 'click', 'touch');
  expect(tooltip.hidden).toBe(true);
  pointer(trigger, 'click', 'touch');
  pointer(document.body, 'pointerdown', 'touch');
  expect(tooltip.hidden).toBe(true);
});

test('keeps a slotted link as the only control with keyboard and touch access', async () => {
  const component = new Tooltip();
  component.externalTrigger = true;
  component.description = 'Full link name';
  const link = document.createElement('a');
  link.href = window.location.href;
  link.textContent = 'Full link name';
  component.append(link);
  document.body.append(component);
  await component.updateComplete;
  const root = component.shadowRoot!;
  const tooltip = root.querySelector<HTMLElement>('[role="tooltip"]')!;
  expect(root.querySelector('button')).toBeNull();
  expect(tooltip.getAttribute('aria-hidden')).toBe('true');
  link.focus();
  expect(tooltip.hidden).toBe(false);
  link.blur();
  expect(tooltip.hidden).toBe(true);

  const tap = () => link.dispatchEvent(new PointerEvent('click', {
    pointerType: 'touch', bubbles: true, composed: true, cancelable: true,
  }));
  expect(tap()).toBe(false);
  expect(tooltip.hidden).toBe(false);
  expect(tap()).toBe(true);
});

test('reveals the full value of truncated text on touch', async () => {
  const component = new Tooltip();
  component.externalTrigger = true;
  component.description = 'Full version';
  const label = document.createElement('span');
  label.tabIndex = 0;
  label.textContent = component.description;
  component.append(label);
  document.body.append(component);
  await component.updateComplete;
  const tooltip = component.shadowRoot!.querySelector<HTMLElement>('[role="tooltip"]')!;
  expect(tooltip.hidden).toBe(true);
  pointer(label, 'click', 'touch');
  expect(tooltip.hidden).toBe(false);
  pointer(document.body, 'pointerdown', 'touch');
  expect(tooltip.hidden).toBe(true);
});

test('positions above a trigger near the bottom and clamps to the viewport edge', async () => {
  const { component, trigger, tooltip } = await mount();
  const viewport = document.documentElement;
  vi.spyOn(viewport, 'clientWidth', 'get').mockReturnValue(320);
  vi.spyOn(viewport, 'clientHeight', 'get').mockReturnValue(640);
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({
    x: 214, y: 589, width: 90, height: 38,
  }));
  vi.spyOn(tooltip, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({
    width: 280, height: 96,
  }));

  trigger.focus();
  expect(tooltip.hasAttribute('data-above')).toBe(true);
  const sheet = component.shadowRoot!.adoptedStyleSheets.at(-1)!;
  const { style } = sheet.cssRules[0] as CSSStyleRule;
  expect(style.getPropertyValue('--tooltip-left')).toBe('32px');
  expect(style.getPropertyValue('--tooltip-top')).toBe('493px');
  expect(tooltip.hasAttribute('style')).toBe(false);
});

// Verifies REQ-0004 and REQ-0016.
test('keeps the text description available to the trigger and renders it as text', async () => {
  const { component, trigger, tooltip } = await mount();
  expect(trigger.tabIndex).toBe(0);
  expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
  expect(tooltip.textContent?.trim()).toBe(description);
  expect(tooltip.hidden).toBe(true);
  expect(trigger.classList.contains('hint')).toBe(false);

  component.description = '<img src=x>';
  component.hint = true;
  await component.updateComplete;
  expect(tooltip.textContent?.trim()).toBe(component.description);
  expect(tooltip.querySelector('img')).toBeNull();
  expect(trigger.classList.contains('hint')).toBe(true);
});
