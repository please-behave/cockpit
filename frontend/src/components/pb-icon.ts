import { css, html, LitElement, nothing } from 'lit';
import { icons, type IconName } from './icons';

export class Icon extends LitElement {
  static override properties = {
    name: { type: String },
    label: { type: String },
  };

  static override styles = css`
    @layer components {
      :host {
        display: inline-block;
        flex: none;
        vertical-align: -0.125em;
      }

      svg {
        display: block;
        inline-size: 0.875rem;
        block-size: 0.875rem;
      }
    }
  `;

  declare name?: IconName;
  declare label?: string;

  override render() {
    if (!this.name || !Object.hasOwn(icons, this.name)) return nothing;
    const label = this.label?.trim() || nothing;
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" focusable="false"
        role=${label === nothing ? nothing : 'img'} aria-label=${label}
        aria-hidden=${label === nothing ? 'true' : nothing}>${icons[this.name]}</svg>
    `;
  }
}

customElements.define('pb-icon', Icon);
