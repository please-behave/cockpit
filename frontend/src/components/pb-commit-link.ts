import { css, html, LitElement } from 'lit';
import { commitUrl } from '../commit-link';
import { linkStyles } from '../styles/links';

export class CommitLink extends LitElement {
  static override properties = {
    repository: { type: String },
    commit: { type: String },
    full: { type: Boolean, reflect: true },
  };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host(:not([full])) {
        white-space: nowrap;
      }

      a:focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      .assistive {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `;

  declare repository: string;
  declare commit: string;
  declare full: boolean;

  constructor() {
    super();
    this.repository = '';
    this.commit = '';
    this.full = false;
  }

  override render() {
    const label = this.full ? this.commit : Array.from(this.commit).slice(0, 7).join('');
    const url = commitUrl(this.repository, this.commit);
    if (!url) return html`<code>${label}</code>`;

    return html`<a href=${url} target="_blank" rel="noopener noreferrer"><code>${label}</code>
      <span aria-hidden="true">↗</span><span class="assistive">(opens in a new tab)</span></a>`;
  }
}

customElements.define('pb-commit-link', CommitLink);
