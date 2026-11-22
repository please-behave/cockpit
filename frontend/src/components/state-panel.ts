import { css } from 'lit';

export const statePanelStyles = css`
  @layer components {
    :host {
      display: block;
    }

    .panel {
      padding: var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-panel);
      background: var(--surface-raised);
      color: var(--text);
      overflow-wrap: anywhere;
    }

    h2, p {
      margin: 0;
    }

    p {
      margin-block-start: var(--space-2);
      color: var(--text-muted);
    }
  }
`;
