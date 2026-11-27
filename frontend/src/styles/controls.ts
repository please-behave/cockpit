import { css } from 'lit';

export const controlStyles = css`
  @layer components {
    label {
      font-weight: var(--weight-semibold);
    }

    input, select, button {
      box-sizing: border-box;
      min-block-size: var(--target-min-size);
      padding: var(--control-padding-block) var(--control-padding-inline);
      border: 1px solid var(--border);
      border-radius: var(--radius-control);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    button { cursor: pointer; }
    button:hover { background: var(--surface-hover); }

    .panel {
      padding: var(--panel-padding);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-panel);
      background: var(--surface-raised);
    }
  }
`;
