export type Route =
  | { view: 'dashboard' }
  | { view: 'history' }
  | { view: 'detail'; id: string }
  | { view: 'not-found' };

export type Origin = 'dashboard' | 'history';

export function originOf(state: unknown): Origin | undefined {
  const origin = (state as { origin?: unknown } | null)?.origin;
  return origin === 'dashboard' || origin === 'history' ? origin : undefined;
}

export function routeFor(path: string): Route {
  if (path === '/') return { view: 'dashboard' };
  if (path === '/attestations') return { view: 'history' };
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

  private readonly traverse = () => this.pop(true);

  private pop(traversal: boolean) {
    this.navigate(window.location.pathname, originOf(window.history.state), traversal);
  }

  private readonly click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (!link?.hasAttribute('data-route') || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;

    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.hash) return;

    event.preventDefault();
    if (url.pathname === window.location.pathname) return;
    window.history.pushState(this.stateFor(url.pathname), '', url);
    this.pop(false);
    window.scrollTo(0, 0);
  };

  private stateFor(target: string) {
    const from = routeFor(window.location.pathname).view;
    const origin = routeFor(target).view === 'detail' && (from === 'dashboard' || from === 'history') ? from : undefined;
    return origin ? { origin } : null;
  }
}
