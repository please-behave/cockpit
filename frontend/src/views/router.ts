import type { RuleIdentity } from '../api/client';

export type Route =
  | { view: 'dashboard' }
  | { view: 'history' }
  | { view: 'detail'; id: string }
  | { view: 'rules'; search: string }
  | { view: 'rule'; search: string; version: string | null }
  | { view: 'not-found' };

export type AttestationOrigin = { attestationPath: string };
export type Origin = 'dashboard' | 'history' | AttestationOrigin;

export function originOf(state: unknown): Origin | undefined {
  const origin = (state as { origin?: unknown } | null)?.origin;
  if (origin === 'dashboard' || origin === 'history') return origin;
  const path = (origin as Partial<AttestationOrigin> | null)?.attestationPath;
  if (typeof path === 'string' && routeFor(path).view === 'detail') return { attestationPath: path };
}

function isPlainClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 &&
    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function followHistoryBack(event: MouseEvent) {
  if (!isPlainClick(event)) return;
  event.preventDefault();
  window.history.back();
}

export function routeFor(location: string): Route {
  const query = location.indexOf('?');
  const path = query === -1 ? location : location.slice(0, query);
  const search = query === -1 ? '' : location.slice(query);
  if (path === '/') return { view: 'dashboard' };
  if (path === '/attestations') return { view: 'history' };
  if (path === '/rules') return { view: 'rules', search };
  if (path === '/rules/detail') {
    const identity = new URLSearchParams(search);
    const version = identity.get('version');
    identity.delete('version');
    return { view: 'rule', search: identity.toString(), version };
  }
  const detail = /^\/attestations\/([^/]+)$/.exec(path);
  if (detail) {
    try {
      return { view: 'detail', id: decodeURIComponent(detail[1]) };
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return { view: 'detail', id: '' };
    }
  }
  return { view: 'not-found' };
}

export function rulePath({ source, path, id }: RuleIdentity, version?: string): string {
  const query = new URLSearchParams({ source, path, id });
  if (version !== undefined) query.set('version', version);
  return `/rules/detail?${query}`;
}

export class Router {
  constructor(
    private readonly host: HTMLElement,
    private readonly navigate: (path: string, origin?: Origin, traversal?: boolean) => void,
  ) {}

  connect() {
    this.host.addEventListener('click', this.click);
    window.addEventListener('popstate', this.traverse);
    this.pop(false);
  }

  disconnect() {
    this.host.removeEventListener('click', this.click);
    window.removeEventListener('popstate', this.traverse);
  }

  selectRuleVersion(version: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('version', version);
    window.history.replaceState(window.history.state, '', url);
    this.pop(false);
  }

  private readonly traverse = () => this.pop(true);

  private pop(traversal: boolean) {
    this.navigate(window.location.pathname + window.location.search, originOf(window.history.state), traversal);
  }

  private readonly click = (event: MouseEvent) => {
    if (!isPlainClick(event)) return;

    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (!link?.hasAttribute('data-route') || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;

    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.hash) return;

    event.preventDefault();
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    window.history.pushState(this.stateFor(url.pathname), '', url);
    this.pop(false);
    window.scrollTo(0, 0);
  };

  private stateFor(target: string) {
    const from = window.location.pathname + window.location.search;
    const current = routeFor(from).view;
    const next = routeFor(target).view;
    if (next === 'detail' && (current === 'dashboard' || current === 'history')) return { origin: current };
    if (next === 'rule' && current === 'detail') return { origin: { attestationPath: from } };
    return null;
  }
}
