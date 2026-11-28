import { css, html, LitElement, svg } from 'lit';
import { iconControlStyles } from '../styles/controls';
import { chooseTheme, effectiveTheme, watchSystemTheme, type Theme } from '../theme';
import './pb-tooltip';

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
    ${iconControlStyles}

    @layer components {
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
      <pb-tooltip external-trigger .description=${action}>
        <button class="icon-control" type="button" aria-label=${action} @click=${this.toggleTheme}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            ${dark ? sun : moon}
          </svg>
        </button>
      </pb-tooltip>
    `;
  }
}

customElements.define('pb-theme-toggle', ThemeToggle);
