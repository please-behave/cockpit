import { afterEach, expect, test } from 'vitest';
import { Badge, kindTone } from './pb-badge';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015.
test.each([
  ['check', 'check'],
  ['review', 'review'],
  ['integrity', undefined],
  ['', undefined],
])('maps the kind %s to the tone %s', (kind, tone) => {
  expect(kindTone(kind)).toBe(tone);
});

// Verifies REQ-0015.
test('a tone is reflected as an attribute and the label stays written out', async () => {
  const badge = new Badge();
  badge.tone = 'blocking';
  badge.textContent = 'Blocking';
  document.body.append(badge);
  await badge.updateComplete;
  expect(badge.getAttribute('tone')).toBe('blocking');
  expect(badge.textContent).toBe('Blocking');
});

// Verifies REQ-0016.
test('uses a pointer cursor and prevents label text selection', () => {
  const styles = Badge.styles.cssText;
  expect(styles).toMatch(/:host \{[^}]*cursor: pointer;[^}]*user-select: none;/);
});
