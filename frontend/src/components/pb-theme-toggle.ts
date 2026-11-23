import { css, html, LitElement, svg } from 'lit';
import { chooseTheme, effectiveTheme, watchSystemTheme, type Theme } from '../theme';

const sun = svg`
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2.5v2.25m0 14.5v2.25M2.5 12h2.25m14.5 0h2.25M5.3 5.3l1.6 1.6m10.2 10.2 1.6 1.6m0-13.4-1.6 1.6M6.9 17.1l-1.6 1.6"/>
`;
const moon = svg`
  <path d="M20.7 14.3a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z"/>
`;

export class ThemeToggle extends LitElement {
  static override properties = { theme: { state: true } };

  static override styles = css`
    @layer components {
      button {
        display: grid;
        place-items: center;
        inline-size: calc(var(--space-8) + var(--space-3));
        aspect-ratio: 1;
        padding: 0;
        border: 0;
        background: var(--surface-raised);
        color: inherit;
        cursor: pointer;
      }

      button:hover {
        background: var(--surface-hover);
      }

      button:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-2 * var(--focus-offset));
      }

      svg {
        inline-size: calc(var(--space-4) + var(--space-1));
        block-size: auto;
      }
    }
  `;

  declare private theme: Theme;
  private unwatchSystemTheme?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    this.theme = effectiveTheme();
    this.unwatchSystemTheme = watchSystemTheme(() => { this.theme = effectiveTheme(); });
  }

  override disconnectedCallback() {
    this.unwatchSystemTheme?.();
    super.disconnectedCallback();
  }

  private toggleTheme() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    chooseTheme(nextTheme);
    this.theme = nextTheme;
  }

  override render() {
    const dark = this.theme === 'dark';
    const action = dark ? 'Switch to light theme' : 'Switch to dark theme';
    return html`
      <button type="button" aria-label=${action} title=${action} @click=${this.toggleTheme}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${dark ? sun : moon}
        </svg>
      </button>
    `;
  }
}

customElements.define('pb-theme-toggle', ThemeToggle);
