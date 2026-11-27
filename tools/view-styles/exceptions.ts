import type { Exception } from './view-styles';

export const exceptions: Exception[] = [
  { file: 'cockpit-view.ts', selector: 'h1', reason: 'The view base layer defines the heading scale that every view inherits.' },
  { file: 'cockpit-view.ts', selector: 'h2', reason: 'The view base layer defines the heading scale that every view inherits.' },
  { file: 'cockpit-view.ts', selector: 'h3', reason: 'The view base layer defines the heading scale that every view inherits.' },
  { file: 'detail.ts', selector: 'pb-data-table::part(rule-version)', reason: 'Moves into shared muted text styling in stage 3 of issue 118.' },
  { file: 'history.ts', selector: '.end', reason: 'Moves into shared muted text styling in stage 3 of issue 118.' },
  { file: 'repository.ts', selector: '.canonical', reason: 'Moves into shared muted text styling in stage 3 of issue 118.' },
  { file: 'rule-set.ts', selector: 'pb-data-table::part(member-status), .registered', reason: 'Moves into shared muted text styling in stage 3 of issue 118.' },
  { file: 'rule.ts', selector: 'dt', reason: 'Moves into pb-key-value in stage 3 of issue 118.' },
  { file: 'rule.ts', selector: '.knowledge dt', reason: 'Moves into pb-key-value in stage 3 of issue 118.' },
  { file: 'rule.ts', selector: '.identity', reason: 'Moves into shared muted text styling in stage 3 of issue 118.' },
  { file: 'rules.ts', selector: 'details', reason: 'Moves into a shared disclosure component in stage 3 of issue 118.' },
  { file: 'rules.ts', selector: 'summary', reason: 'Moves into a shared disclosure component in stage 3 of issue 118.' },
  { file: 'rules.ts', selector: '.set', reason: 'Moves into a shared disclosure component in stage 3 of issue 118.' },
  { file: 'rules.ts', selector: '.set summary', reason: 'Moves into a shared disclosure component in stage 3 of issue 118.' },
  { file: 'rules.ts', selector: '.incomplete', reason: 'Moves into pb-key-value in stage 3 of issue 118.' },
];
