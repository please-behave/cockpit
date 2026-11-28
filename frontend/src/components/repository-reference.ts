import { css, html, nothing, type TemplateResult } from 'lit';
import { repositoryPath } from '../views/router';
import { ownerName, shortName } from './pb-short-name';
import './pb-tooltip';

export const repositoryReferenceStyles = css`
  @layer components {
    .repository-reference {
      display: inline-flex;
      align-items: baseline;
      min-inline-size: 0;
      max-inline-size: 100%;
      white-space: nowrap;
    }

    .repository-reference pb-tooltip { flex: 0 4 auto; min-inline-size: var(--target-min-size); }

    .repository-prefix, .repository-reference a.repository-name {
      display: inline-block;
      overflow: hidden;
      text-overflow: ellipsis;
      vertical-align: bottom;
    }

    .repository-prefix { flex: 0 1 auto; }
    .repository-reference a.repository-name { max-inline-size: 100%; }
  }
`;

export function repositoryReference(repository: string, preview?: TemplateResult) {
  const name = shortName(repository);
  const owner = ownerName(repository);
  const prefix = owner ? `${owner}/` : '';
  return html`<span class="repository-reference"><span class="repository-prefix" aria-hidden="true">${prefix}</span><pb-tooltip
    external-trigger ?text-value=${!preview} ?interactive=${Boolean(preview)} .description=${repository}
    .visibleText=${prefix + name}>
    <a class="repository-name" data-route href=${repositoryPath(repository)} aria-label=${repository}>${name}</a>
    ${preview ?? nothing}
  </pb-tooltip></span>`;
}
