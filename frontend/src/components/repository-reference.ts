import { css, html, nothing, type TemplateResult } from 'lit';
import { repositoryPath } from '../views/router';
import { ownerName, shortName } from './pb-short-name';
import './pb-tooltip';

export const repositoryReferenceStyles = css`
  @layer components {
    .repository-reference {
      --prefix-min-size: 1.5em;
      display: inline-flex;
      align-items: baseline;
      min-inline-size: 0;
      max-inline-size: 100%;
      white-space: nowrap;
    }

    .repository-reference pb-tooltip {
      flex: none;
      max-inline-size: 100%;
    }

    .repository-prefix + pb-tooltip {
      max-inline-size: calc(100% - var(--prefix-min-size));
    }

    .repository-prefix {
      display: inline-flex;
      min-inline-size: var(--prefix-min-size);
    }

    .repository-owner, .repository-reference a.repository-name {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .repository-reference a.repository-name {
      box-sizing: border-box;
      max-inline-size: 100%;
    }

    .repository-reference a:focus-visible {
      outline-offset: calc(-1 * var(--focus-offset));
    }
  }
`;

export function repositoryReference(repository: string, preview?: TemplateResult) {
  const name = shortName(repository);
  const owner = ownerName(repository);
  const prefix = owner ? `${owner}/` : '';
  return html`<span class="repository-reference">${owner
    ? html`<span class="repository-prefix" aria-hidden="true"><span class="repository-owner">${owner}</span>/</span>`
    : nothing}<pb-tooltip
    external-trigger clipping-selector=".repository-owner" ?text-value=${!preview} ?interactive=${Boolean(preview)} .description=${repository}
    .visibleText=${prefix + name}>
    <a class="repository-name" data-route href=${repositoryPath(repository)} aria-label=${repository}>${name}</a>
    ${preview ?? nothing}
  </pb-tooltip></span>`;
}
