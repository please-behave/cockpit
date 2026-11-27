import { css } from 'lit';

export const disclosureStyles = css`
  @layer components {
    .disclosure {
      border: 1px solid var(--border);
      border-radius: var(--radius-control);
      background: var(--surface);
    }

    .disclosure > summary {
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text);
      cursor: pointer;
    }

    .disclosure > summary:focus-visible { outline-offset: calc(-1 * var(--focus-offset)); }

    .disclosure.set { border-color: var(--rule-set); }

    .disclosure.set > summary {
      background: var(--rule-set-surface);
      color: var(--rule-set-text);
    }
  }
`;
