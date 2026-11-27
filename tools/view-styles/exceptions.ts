import type { Exception } from './view-styles';

export const exceptions: Exception[] = [
  { file: 'cockpit-view.ts', selector: 'h1', reason: 'The view base layer defines the heading scale that every view inherits.' },
  { file: 'cockpit-view.ts', selector: 'h2', reason: 'The view base layer defines the heading scale that every view inherits.' },
  { file: 'cockpit-view.ts', selector: 'h3', reason: 'The view base layer defines the heading scale that every view inherits.' },
];
