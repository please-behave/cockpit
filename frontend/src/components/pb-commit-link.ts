import { css, html, LitElement } from 'lit';
import { commitUrl } from '../commit-link';

export class CommitLink extends LitElement {
  static override properties = {
    repository: { type: String },
    commit: { type: String },
  };

  static override styles = css`
    @layer components {
      :host {
        white-space: nowrap;
      }

      a {
        color: inherit;
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

  constructor() {
    super();
    this.repository = '';
    this.commit = '';
  }

  override render() {
    const short = Array.from(this.commit).slice(0, 7).join('');
    const url = commitUrl(this.repository, this.commit);
    if (!url) return html`<code>${short}</code>`;

    return html`<a href=${url} target="_blank" rel="noopener noreferrer"><code>${short}</code>
      <span aria-hidden="true">↗</span><span class="assistive">(opens in a new tab)</span></a>`;
  }
}

customElements.define('pb-commit-link', CommitLink);
