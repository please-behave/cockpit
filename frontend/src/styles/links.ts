import { css } from 'lit';

export const linkStyles = css`
  @layer tokens, base, components, utilities;

  @layer base {
    a:any-link {
      color: var(--link);
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }
  }
`;
