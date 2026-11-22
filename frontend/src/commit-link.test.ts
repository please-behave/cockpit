import { expect, test } from 'vitest';
import { commitUrl } from './commit-link';

// Verifies REQ-0020.
test.each([
  ['github.com/acme/widget', 'abc1234', 'https://github.com/acme/widget/commit/abc1234'],
  ['github.com/a-b/c_d.e', '0123456789ABCDEF', 'https://github.com/a-b/c_d.e/commit/0123456789ABCDEF'],
])('builds a commit link for %s', (repository, commit, expected) => {
  expect(commitUrl(repository, commit)).toBe(expected);
});

test.each([
  'gitlab.com/acme/widget',
  'github.com/acme',
  'github.com/acme/widget/extra',
  'github.com//widget',
  'github.com/acme/widget?x=1',
  'github.com/acme/..',
  'github.com/../widget',
  'github.com/acme/wid%67et',
  'https://github.com/acme/widget',
  'evil.example/github.com/acme/widget',
  'xgithub.com/acme/widget',
  'github.com/acme/widget\n',
  'acme/widget',
  '',
])('builds no link for the repository value %j', repository => {
  expect(commitUrl(repository, 'abc1234')).toBeUndefined();
});

test('builds no link for a commit that is not a hexadecimal id', () => {
  expect(commitUrl('github.com/acme/widget', '../../x')).toBeUndefined();
  expect(commitUrl('github.com/acme/widget', '')).toBeUndefined();
});
