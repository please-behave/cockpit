import { css } from 'lit';

export const textStyles = css`
  @layer components {
    .muted { color: var(--text-muted); }
    .meta { color: var(--text-muted); font-size: var(--type-meta); line-height: var(--line-meta); }
    .regular { font-weight: normal; }
    .strong { font-weight: var(--weight-semibold); }
    .definitions dt { font-weight: var(--weight-semibold); }
    .definitions.meta-terms dt { color: var(--text-muted); font-size: var(--type-meta); line-height: var(--line-meta); }
  }
`;
