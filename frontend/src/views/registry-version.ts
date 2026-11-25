import { css, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';

interface Version {
  version: string;
  registered_at: string;
}

const optionTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const versionSelectorStyles = css`
  @layer components {
    .version-field {
      display: flex;
      flex-direction: column;
      align-items: start;
      gap: var(--space-1);
    }

    .version-field select {
      max-inline-size: 100%;
      min-block-size: 2.75rem;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-control);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
  }
`;

export function selectedVersion<T extends Version>(versions: T[] | undefined, requested: string | null) {
  return versions?.find(version => version.version === requested) ?? versions?.at(-1);
}

export function versionSelector(host: HTMLElement, versions: Version[], selected: Version) {
  if (versions.length < 2) return nothing;
  const latest = versions.at(-1);
  return html`<label class="version-field">
    Version
    <select @change=${(event: Event) => {
      const select = event.currentTarget as HTMLSelectElement;
      host.dispatchEvent(new CustomEvent('version-change', { detail: select.value }));
    }}>
      ${versions.slice().reverse().map(version => {
        const date = new Date(version.registered_at);
        const time = Number.isNaN(date.getTime()) ? version.registered_at : optionTime.format(date);
        const label = `${version.version} · ${time}${version === latest ? ' · Latest' : ''}`;
        return html`<option value=${version.version} .selected=${live(version === selected)}>${label}</option>`;
      })}
    </select>
  </label>`;
}
