import { afterEach, expect, test, vi } from 'vitest';
import { originOf, routeFor, Router } from './router';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

test('recognizes the dashboard, history, detail, malformed identifier and unknown pages', () => {
  expect(routeFor('/')).toEqual({ view: 'dashboard' });
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

// Verifies REQ-0010.
test.each([
  ['/', 'dashboard'],
  ['/attestations', 'history'],
] as const)('records %s as the origin of a detail page and keeps it across a reload', (start, origin) => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', start);
  const host = document.createElement('div');
  document.body.append(host);
  const link = document.createElement('a');
  link.href = '/attestations/id';
  link.setAttribute('data-route', '');
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    link.click();
    expect(navigate).toHaveBeenLastCalledWith('/attestations/id', origin, false);
    expect(window.history.state).toEqual({ origin });
    router.disconnect();
    navigate.mockClear();
    router.connect();
    expect(navigate).toHaveBeenLastCalledWith('/attestations/id', origin, false);
  } finally {
    router.disconnect();
  }
});

test('records no origin for a direct open or a non-detail navigation', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', '/attestations/first');
  const host = document.createElement('div');
  document.body.append(host);
  const link = document.createElement('a');
  link.href = '/attestations/second';
  link.setAttribute('data-route', '');
  host.append(link);
  const navigate = vi.fn();
  const router = new Router(host, navigate);
  router.connect();

  try {
    expect(navigate).toHaveBeenLastCalledWith('/attestations/first', undefined, false);
    link.click();
    expect(navigate).toHaveBeenLastCalledWith('/attestations/second', undefined, false);
    expect(window.history.state).toBeNull();
  } finally {
    router.disconnect();
  }
});

test('accepts only known origins from the navigation state', () => {
  expect(originOf({ origin: 'history' })).toBe('history');
  expect(originOf({ origin: 'dashboard' })).toBe('dashboard');
  expect(originOf({ origin: 'elsewhere' })).toBeUndefined();
  expect(originOf(null)).toBeUndefined();
});
