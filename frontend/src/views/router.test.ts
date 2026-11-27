import { afterEach, expect, test, vi } from 'vitest';
import { followHistoryBack, originOf, routeFor, Router } from './router';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

test('recognizes the dashboard, history, detail, malformed identifier and unknown pages', () => {
  expect(routeFor('/')).toEqual({ view: 'dashboard', search: '' });
  expect(routeFor('/attestations')).toEqual({ view: 'history' });
  expect(routeFor('/attestations/')).toEqual({ view: 'not-found' });
  expect(routeFor('/attestations/%7B123%7D')).toEqual({ view: 'detail', id: '{123}' });
  expect(routeFor('/attestations/%FF')).toEqual({ view: 'detail', id: '' });
  expect(routeFor('/attestations/id/nested')).toEqual({ view: 'not-found' });
  expect(routeFor('/future')).toEqual({ view: 'not-found' });
});

test('uses a real anchor in Shadow DOM and follows back and forward navigation', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const link = document.createElement('a');
  const path = '/attestations/id';
  link.href = path;
  link.setAttribute('data-route', '');
  root.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    expect(navigate).toHaveBeenLastCalledWith('/', undefined, false);
    link.click();
    expect(window.location.pathname).toBe(path);
    expect(navigate).toHaveBeenLastCalledWith(path, 'dashboard', false);

    const back = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    await back;
    expect(navigate).toHaveBeenLastCalledWith('/', undefined, true);

    const forward = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.forward();
    await forward;
    expect(navigate).toHaveBeenLastCalledWith(path, 'dashboard', true);
  } finally {
    router.disconnect();
  }

  navigate.mockClear();
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(navigate).not.toHaveBeenCalled();
});

test('preserves native behavior for modified clicks, new tabs and regular links', () => {
  const host = document.createElement('div');
  const link = document.createElement('a');
  link.href = '/attestations/id';
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    const intercepted = (init: MouseEventInit = {}) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      let prevented = false;
      host.addEventListener('click', event => {
        prevented = event.defaultPrevented;
        event.preventDefault();
      }, { once: true });
      link.dispatchEvent(event);
      return prevented;
    };

    expect(intercepted()).toBe(false);
    link.setAttribute('data-route', '');
    expect(intercepted({ ctrlKey: true })).toBe(false);
    expect(intercepted({ button: 1 })).toBe(false);
    link.target = '_blank';
    expect(intercepted()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  } finally {
    router.disconnect();
  }
});

const rule = '/rules/detail?source=example&path=checks%2Fexample&id=example&version=1.0';

// Verifies REQ-0010 and REQ-0026.
test.each([
  ['/', '/attestations/id', 'dashboard'],
  ['/attestations', '/attestations/id', 'history'],
  ['/attestations/%7Bid%7D?ref=example', rule, { attestationPath: '/attestations/%7Bid%7D?ref=example' }],
] as const)('records the origin when going from %s to %s and keeps it across a reload', (start, target, origin) => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', start);
  const host = document.createElement('div');
  document.body.append(host);
  const link = document.createElement('a');
  link.href = target;
  link.setAttribute('data-route', '');
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    link.click();
    expect(navigate).toHaveBeenLastCalledWith(target, origin, false);
    expect(window.history.state).toEqual({ origin });
    router.disconnect();
    navigate.mockClear();
    router.connect();
    expect(navigate).toHaveBeenLastCalledWith(target, origin, false);
  } finally {
    router.disconnect();
  }
});

// Verifies REQ-0026.
test('replaces the rule version in history and keeps the attestation as the Back destination', async () => {
  const from = '/attestations/id';
  window.history.replaceState(null, '', from);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const host = document.createElement('div');
  const link = document.createElement('a');
  link.href = rule;
  link.setAttribute('data-route', '');
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    link.click();
    const length = window.history.length;
    router.selectVersion('2.0');
    const selected = rule.replace('version=1.0', 'version=2.0');
    expect(window.history.length).toBe(length);
    expect(navigate).toHaveBeenLastCalledWith(selected, { attestationPath: from }, false);
    expect(routeFor(selected)).toEqual({
      view: 'rule', search: 'source=example&path=checks%2Fexample&id=example', version: '2.0',
    });

    const back = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    await back;
    expect(navigate).toHaveBeenLastCalledWith(from, undefined, true);
  } finally {
    router.disconnect();
  }
});

test.each([
  ['/attestations/first', '/attestations/second'],
  [rule, '/rules'],
  ['/rules', rule],
])('records no origin for a direct open of %s or navigation to %s', (start, target) => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', start);
  const host = document.createElement('div');
  document.body.append(host);
  const link = document.createElement('a');
  link.href = target;
  link.setAttribute('data-route', '');
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    expect(navigate).toHaveBeenLastCalledWith(start, undefined, false);
    link.click();
    expect(navigate).toHaveBeenLastCalledWith(target, undefined, false);
    expect(window.history.state).toBeNull();
  } finally {
    router.disconnect();
  }
});

test('accepts only known origins from the navigation state', () => {
  expect(originOf({ origin: 'history' })).toBe('history');
  expect(originOf({ origin: 'dashboard' })).toBe('dashboard');
  expect(originOf({ origin: { attestationPath: '/attestations/id' } })).toEqual({ attestationPath: '/attestations/id' });
  expect(originOf({ origin: { attestationPath: '/rules' } })).toBeUndefined();
  expect(originOf({ origin: { attestationPath: '//example.com/attestations/id' } })).toBeUndefined();
  expect(originOf({ origin: 'elsewhere' })).toBeUndefined();
  expect(originOf(null)).toBeUndefined();
});

// Verifies REQ-0026.
test('the back link follows history for an ordinary activation and preserves modified clicks', () => {
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }]) {
    const event = new MouseEvent('click', { cancelable: true, ...modifier });
    followHistoryBack(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(back).not.toHaveBeenCalled();

  const event = new MouseEvent('click', { cancelable: true });
  followHistoryBack(event);
  expect(event.defaultPrevented).toBe(true);
  expect(back).toHaveBeenCalledOnce();
});
