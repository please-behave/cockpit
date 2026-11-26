import { css, html, LitElement, nothing } from 'lit';
import { commitUrl } from '../commit-link';
import { linkStyles } from '../styles/links';
import './pb-tooltip';

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
    const shortened = label !== this.commit;
    const url = commitUrl(this.repository, this.commit);
    if (!url) {
      const code = html`<code>${label}</code>`;
      return shortened ? html`<pb-tooltip .description=${this.commit}>${code}</pb-tooltip>` : code;
    }

    const link = html`<a href=${url} target="_blank" rel="noopener noreferrer"><code
      aria-hidden=${shortened ? 'true' : nothing}>${label}</code>
      <span aria-hidden="true">↗</span><span class="assistive">${shortened ? `${this.commit} ` : nothing}(opens in a new tab)</span></a>`;
    return shortened ? html`<pb-tooltip external-trigger .description=${this.commit}>${link}</pb-tooltip>` : link;
  }
}

customElements.define('pb-commit-link', CommitLink);
