export type Route =
  | { view: 'overview' }
  | { view: 'detail'; id: string }
  | { view: 'not-found' };

export function routeFor(path: string): Route {
  if (path === '/') return { view: 'overview' };
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
    private readonly navigate: (path: string) => void,
  ) {}

  connect() {
    this.host.addEventListener('click', this.click);
    window.addEventListener('popstate', this.pop);
    this.pop();
  }

  disconnect() {
    this.host.removeEventListener('click', this.click);
    window.removeEventListener('popstate', this.pop);
  }

  private readonly pop = () => this.navigate(window.location.pathname);

  private readonly click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const link = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (!link?.hasAttribute('data-route') || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;

    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.hash) return;

    event.preventDefault();
    if (url.href === window.location.href) return;
    window.history.pushState(null, '', url);
    this.pop();
    window.scrollTo(0, 0);
  };
}
