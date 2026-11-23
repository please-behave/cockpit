import { css, html, LitElement, nothing } from 'lit';

export function shortName(value: string) {
  return value.slice(value.lastIndexOf('/') + 1);
}

export function ownerName(value: string) {
  const segments = value.split('/');
  return segments.length > 1 ? segments[segments.length - 2] : '';
}

export class ShortName extends LitElement {
  static override properties = { value: { type: String } };

  static override styles = css`
    @layer components {
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

  declare value: string;

  constructor() {
    super();
    this.value = '';
  }

  override render() {
    if (!this.value) return nothing;

    return html`<span aria-hidden="true" class="short">${shortName(this.value)}</span><span class="assistive">${this.value}</span>`;
  }
}

customElements.define('pb-short-name', ShortName);
