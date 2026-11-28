import { afterEach, expect, test, vi } from 'vitest';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RepositoryOverview, RepositoryOverviewEntry, RepositoryRuleSets } from '../api/client';
import { releasePath, repositoryPath, Router, ruleSetPath } from '../views/router';
import type { CommitLink } from './pb-commit-link';
import type { RelativeTime } from './pb-relative-time';
import type { RepoChip } from './pb-repo-chip';
import { RepositoryMap } from './pb-repository-map';
import type { RuleSetChip } from './pb-rule-set-chip';
import type { StatusPill } from './pb-status-pill';
import type { Tooltip } from './pb-tooltip';
import type { Widget } from './pb-widget';

const { repositories } = respond(fixtureTargets.repositoryMap)!.body as RepositoryOverview;
const completed = respond(fixtureTargets.completedRuleSets)!.body as RepositoryRuleSets[];
const fixture = (name: string) => repositories.find(entry => entry.repository.endsWith(`/${name}`))!;

async function mount(entries: RepositoryOverviewEntry[] = [...repositories].reverse()) {
  const map = new RepositoryMap();
  map.repositories = entries;
  map.setsByRepository = new Map(completed.map(({ repository, sets }) => [repository, sets]));
  document.body.append(map);
  await map.updateComplete;
  const root = map.shadowRoot!;
  const chips = [...root.querySelectorAll<RepoChip>('pb-repo-chip')];
  await Promise.all(chips.map(chip => chip.updateComplete));
  return { map, root, chips };
}

async function mountChip(name: string) {
  const { chips } = await mount();
  const chip = chips.find(chip => chip.entry === fixture(name))!;
  const root = chip.shadowRoot!;
  const link = root.querySelector<HTMLAnchorElement>('.chip')!;
  const tooltip = root.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const popup = tooltip.shadowRoot!.querySelector<HTMLElement>('[popover]')!;
  const preview = root.querySelector<HTMLElement>('.preview')!;
  return { chip, link, tooltip, popup, preview };
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Verifies REQ-0015, REQ-0017 and REQ-0019.
test('groups the map by worst health, with a heading and counts for each organization', async () => {
  const { root, chips } = await mount();
  const widget = root.querySelector<Widget>('pb-widget')!;
  await widget.updateComplete;
  expect(widget.shadowRoot!.querySelector('section')?.getAttribute('aria-labelledby')).toBe('widget-heading');
  expect(widget.shadowRoot!.querySelector('h2')?.textContent).toBe('Repository map');
  expect(root.querySelectorAll('ul > li')).toHaveLength(repositories.length);
  const failed = repositories.find(entry => entry.latest_check?.overall === 'FAIL')!.repository;
  const markupOwner = '<img src=x onerror=alert(1)>';
  expect([...root.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual([
    'acme', failed.split('/').at(-2), markupOwner, 'b>',
  ]);
  expect(root.querySelector('h3 img')).toBeNull();
  expect([...root.querySelectorAll('.counts span')].slice(0, 4).map(span => span.textContent)).toEqual([
    '3 failed', '1 warning', '3 unknown', '3 passed',
  ]);
  expect(chips.map(chip => chip.entry!.repository)).toEqual([
    'github.com/acme/gadget',
    'github.com/acme/no-records',
    'github.com/acme/overdue-final',
    'github.com/acme/widget',
    'gitlab.com/acme/elsewhere',
    'github.com/acme/never-synced',
    'github.com/acme/stale-sync',
    repositories.find(entry => entry.repository.includes('long-repository-name-'))!.repository,
    'github.com/acme/pending',
    'github.com/acme/return-navigation',
    failed,
    `github.com/${markupOwner}/gadget`,
    repositories.find(entry => entry.repository.startsWith('<b>'))!.repository,
  ]);
});

test('breaks case-only ties by original code points in organization, repository and platform order', async () => {
  const base = fixture('pending');
  const entries = [
    ['gitlab.com/alpha/z', 'gitlab'],
    ['gitlab.com/Alpha/a', 'gitlab'],
    ['github.com/Alpha/a', 'github'],
    ['gitlab.com/Alpha/A', 'gitlab'],
    ['github.com/Alpha/a', 'GitHub'],
  ].map(([repository, platform]) => ({ ...base, repository, platform }));
  const { root, chips } = await mount(entries);
  expect([...root.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['Alpha', 'alpha']);
  expect(chips.map(chip => chip.entry)).toEqual([entries[3], entries[4], entries[2], entries[1], entries[0]]);
});

test('omits the organization heading for an overview with one organization', async () => {
  const { repositories: single } = respond(
    fixtureTargets.repositoryOverview + '?preview=dashboard-single-organization',
  )!.body as RepositoryOverview;
  const { root, chips } = await mount(single);
  expect(root.querySelector('h3')).toBeNull();
  expect(chips).toHaveLength(single.length);
});

test.each([
  ['gadget', 'cross', 'failed', 'Current', 'ERROR'],
  ['no-records', 'cross', 'failed', 'Never integrated', 'No evidence'],
  ['overdue-final', 'cross', 'failed', 'Overdue (step 4 of 4)', 'PASS'],
  ['widget', 'warning', 'warning', 'Overdue (step 1 of 4)', 'PASS'],
  ['never-synced', 'circle', 'unknown', 'Unknown', 'No evidence'],
  ['elsewhere', 'circle', 'unknown', 'Unknown · Not managed', 'PASS'],
  ['pending', 'check', 'passed', 'Pending', 'PASS'],
  ['return-navigation', 'check', 'passed', 'Current', 'PASS'],
])('shows the health symbol, accessible name and preview state for %s', async (name, icon, health, state, verdict) => {
  const { link, preview } = await mountChip(name);
  const { repository } = fixture(name);
  expect(link.querySelector('pb-icon')?.getAttribute('name')).toBe(icon);
  expect(link.querySelector('.short')?.textContent).toBe(name);
  expect(link.getAttribute('aria-label')).toBe(`${repository}, ${health}`);
  expect(link.getAttribute('href')).toBe(repositoryPath(repository));
  expect(preview.querySelector('.preview-name')?.textContent).toBe(repository);
  expect(preview.querySelector('.owner')?.textContent).toBe('acme');
  expect(preview.querySelector('.health')?.textContent?.trim()).toBe(health);
  expect(preview.textContent).toContain(state);
  expect(preview.querySelector<StatusPill>('pb-status-pill')?.status).toBe(verdict);
});

test.each([
  ['return-navigation', '2.0', 'production'],
  ['gadget', '1.0', null],
  ['pending', null, 'staging'],
  ['no-records', null, null],
])('shows only the available release and deployment facts for %s', async (name, version, target) => {
  const { preview } = await mountChip(name);
  const entry = fixture(name);
  const facts = preview.querySelector('.facts');
  if (version) expect(facts?.querySelector('a')?.getAttribute('href')).toBe(releasePath(entry.repository, version));
  else expect(facts?.querySelector('a') ?? null).toBeNull();
  if (target) {
    expect(facts?.textContent).toContain(target);
    expect(facts?.querySelector<RelativeTime>('pb-relative-time')?.value).toBe(entry.latest_deployment!.received_at);
  } else {
    expect(facts?.querySelector('pb-relative-time') ?? null).toBeNull();
  }
  if (!version && !target) expect(facts).toBeNull();
});

// Verifies REQ-0028.
test('shows reported evidence, waiting details and completed Rule Sets when present', async () => {
  const { preview } = await mountChip('return-navigation');
  const entry = fixture('return-navigation');
  expect(preview.textContent).toContain('Reported');
  expect(preview.querySelector<CommitLink>('pb-commit-link')?.commit).toBe(entry.latest_check!.commit);
  expect(preview.querySelector<RelativeTime>('pb-relative-time')?.value).toBe(entry.latest_check!.received_at);
  const chips = [...preview.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
  const sets = completed.find(item => item.repository === entry.repository)!.sets;
  expect(chips.map(chip => [chip.label, chip.href])).toEqual(
    sets.map(set => [`${set.name} · ${set.version}`, ruleSetPath(set, set.version)]),
  );
  expect(preview.querySelector('pb-rule-set-summary')).toBeNull();
  for (const chip of chips) {
    await chip.updateComplete;
    expect(chip.shadowRoot!.querySelector('a')).not.toBeNull();
    const link = chip.shadowRoot!.querySelector('a')!;
    const tooltip = link.closest<Tooltip>('pb-tooltip')!;
    await tooltip.updateComplete;
    link.focus();
    expect(tooltip.shadowRoot!.querySelector<HTMLElement>('[popover]')?.hidden).toBe(true);
    link.blur();
  }

  const { preview: waiting } = await mountChip('widget');
  const report = fixture('widget');
  expect(waiting.querySelector('pb-rule-set-chip')).toBeNull();
  expect(waiting.textContent).toContain('2 observed heads since evidence');
  expect(waiting.querySelector<CommitLink>('.status-warning pb-commit-link')?.commit).toBe(report.head!.commit);
  expect(waiting.querySelector<RelativeTime>('pb-relative-time[duration]')?.value).toBe(report.pending_since);
});

test('opens on hover, retains keyboard focus in the preview and restores it on Escape', async () => {
  vi.useFakeTimers();
  const { chip, link, tooltip, popup, preview } = await mountChip('return-navigation');
  const hover = tooltip.shadowRoot!.querySelector('span')!;
  hover.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  vi.advanceTimersByTime(100);
  expect(popup.hidden).toBe(false);
  hover.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  expect(popup.hidden).toBe(true);

  link.focus();
  expect(popup.hidden).toBe(false);
  const release = preview.querySelector('a')!;
  release.focus();
  expect(popup.hidden).toBe(false);
  release.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  expect(popup.hidden).toBe(true);
  expect(chip.shadowRoot!.activeElement).toBe(link);
});

test('previews on the first tap, navigates on the second and dismisses on outside touch', async () => {
  const { chip, link, popup } = await mountChip('elsewhere');
  const navigate = vi.fn();
  const router = new Router(chip, navigate);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  router.connect();
  const tap = () => link.dispatchEvent(new PointerEvent('click', {
    pointerType: 'touch', bubbles: true, composed: true, cancelable: true,
  }));
  try {
    navigate.mockClear();
    expect(tap()).toBe(false);
    expect(popup.hidden).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(popup.hidden).toBe(true);
    tap();
    tap();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(repositoryPath(fixture('elsewhere').repository), undefined, false);
  } finally {
    router.disconnect();
  }
});

// Verifies REQ-0004.
test('renders fixture markup as text in the chip and preview', async () => {
  const { chips } = await mount();
  const chip = chips.find(chip => chip.entry!.repository.startsWith('<b>'))!;
  const root = chip.shadowRoot!;
  expect(root.querySelector('.short')?.textContent).toContain('<img');
  expect(root.querySelector('.preview-name')?.textContent).toBe(chip.entry!.repository);
  expect(root.querySelector('img')).toBeNull();
});
