import { css } from 'lit';

export const statePanelStyles = css`
  @layer components {
    :host {
      display: block;
    }

    .panel {
      padding: var(--panel-padding);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-panel);
      background: var(--panel-surface);
      color: var(--text);
      overflow-wrap: anywhere;
    }

    h2, p {
      margin: 0;
    }

    h2 {
      font-size: var(--type-section);
      line-height: var(--line-heading);
    }

    p {
      margin-block-start: var(--space-2);
      color: var(--text-muted);
    }
  }
`;
