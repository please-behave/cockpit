import { afterEach, expect, test } from 'vitest';
import type { ActivityEntry } from '../activity';
import { repositoryPath } from '../views/router';
import { ActivityFeed } from './pb-activity-feed';
import type { RelativeTime } from './pb-relative-time';

afterEach(() => document.body.replaceChildren());

const entries: ActivityEntry[] = [
  { kind: 'attestation', key: 'a', repository: 'github.com/acme/widget', receivedAt: '2026-11-23T11:55:00Z', fact: 'FAIL' },
  { kind: 'release', key: 'r', repository: 'github.com/acme/gadget', receivedAt: '2026-11-23T11:00:00Z', fact: 'Version 2.0' },
  { kind: 'deployment', key: 'd', repository: 'github.com/acme/<b>x</b>', receivedAt: '2026-11-23T10:00:00Z', fact: 'Target production' },
];

async function mount(items: readonly ActivityEntry[], failed: ActivityFeed['failed'] = []) {
  const feed = new ActivityFeed();
  feed.entries = items;
  feed.failed = failed;
  document.body.append(feed);
  await feed.updateComplete;
  return feed.shadowRoot!;
}

const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim();

// Verifies REQ-0015, REQ-0016 and REQ-0019.
test('shows kind as symbol and text, the organization and linked repository, the key fact and the receipt time', async () => {
  const root = await mount(entries);
  const rows = [...root.querySelectorAll('li')];
  expect(rows).toHaveLength(3);
  expect(rows.map(row => text(row.querySelector('.kind')))).toEqual(['Attestation', 'Release', 'Deployment']);
  expect(rows.map(row => row.querySelector('pb-icon')?.getAttribute('name'))).toEqual(['attestation', 'release', 'deployment']);
  expect(rows.map(row => row.querySelector('pb-icon')?.hasAttribute('label'))).toEqual([false, false, false]);
  const verdict = rows[0].querySelector('pb-status-pill')!;
  expect(verdict.shadowRoot?.querySelector('.pill span')?.textContent).toBe('Fail');
  expect(rows.map(row => text(row.querySelector('.fact'))))
    .toEqual(['· Reported', 'Version 2.0 · Reported', 'Target production · Reported']);
  rows.forEach((row, index) => {
    const link = row.querySelector('.repository-name')!;
    expect(link.getAttribute('href')).toBe(repositoryPath(entries[index].repository));
    expect(link.getAttribute('aria-label')).toBe(entries[index].repository);
    expect(row.querySelector('.repository-prefix')?.textContent)
      .toBe(entries[index].repository.split('/').at(-2) + '/');
    expect(link.textContent).toBe(entries[index].repository.split('/').at(-1));
    expect(row.querySelector<RelativeTime>('pb-relative-time')!.value).toBe(entries[index].receivedAt);
  });
  expect(root.querySelector('b')).toBeNull();
  expect(root.querySelector('[role=status]')).toBeNull();
});

test('exposes the exact time of an entry as an accessible description', async () => {
  const root = await mount(entries.slice(0, 1));
  const time = root.querySelector<RelativeTime>('pb-relative-time')!;
  await time.updateComplete;
  expect(time.shadowRoot!.querySelector('time')?.getAttribute('datetime')).toBe(entries[0].receivedAt);
  expect(time.shadowRoot!.querySelector('pb-tooltip')).not.toBeNull();
});

test('explains an empty feed', async () => {
  const root = await mount([]);
  expect(text(root.querySelector('p'))).toBe('No attestations, releases or deployments have been received.');
  expect(root.querySelector('ul')).toBeNull();
});

test('keeps the entries and names the kinds that could not be read', async () => {
  const root = await mount(entries.slice(0, 1), ['release', 'deployment']);
  expect(root.querySelectorAll('li')).toHaveLength(1);
  expect(text(root.querySelector('[role=status]')))
    .toBe('Could not read the latest releases and deployments. The feed may be incomplete or outdated.');
});

test('does not call a feed empty when every read failed', async () => {
  const root = await mount([], ['attestation', 'release', 'deployment']);
  expect(root.querySelectorAll('p')).toHaveLength(1);
  expect(text(root.querySelector('[role=status]')))
    .toBe('Could not read the latest attestations, releases and deployments. The feed may be incomplete or outdated.');
});
