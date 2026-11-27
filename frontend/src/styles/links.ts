import { css } from 'lit';

export const linkStyles = css`
  @layer tokens, base, components, utilities;

  @layer base {
    a:any-link {
      display: inline-block;
      min-inline-size: var(--target-min-size);
      max-inline-size: 100%;
      line-height: max(var(--target-min-size), 1em * var(--line-data));
      color: var(--accent-link);
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }

    a:any-link:hover { color: var(--accent-link-hover); }

    a:focus-visible {
      outline: var(--focus-ring);
      outline-offset: var(--focus-offset);
    }
  }
`;
