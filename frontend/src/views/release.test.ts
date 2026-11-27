// Verifies REQ-0004, REQ-0015, REQ-0016 and REQ-0032.
import { afterEach, expect, test, vi } from 'vitest';
import { CockpitApp } from '../components/app';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { StatusPill } from '../components/pb-status-pill';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { ReleaseView } from './release';
import { releasePath, routeFor } from './router';

const repository = 'github.com/acme/return-navigation';
const markup = '<img src=x onerror=alert(1)>';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(path: string) {
  vi.stubGlobal('fetch', vi.fn(async (target: string) => {
    const fixture = respond(target)!;
    return Response.json(fixture.body, { status: fixture.status });
  }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', path);
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  return app.shadowRoot!.querySelector<ReleaseView>('pb-release')!.shadowRoot!;
}

async function open(path: string) {
  const root = await mount(path);
  await vi.waitFor(() => expect(root.querySelector('pb-key-value')).not.toBeNull());
  return root;
}

const pills = (root: ParentNode) => [...root.querySelectorAll<StatusPill>('pb-status-pill')].map(pill => pill.status);

test('shows a complete release with its commit, sender, evidence link and Rule Set chips', async () => {
  const root = await open(releasePath(repository, '2.0'));
  expect(root.querySelector('h1:not(.assistive)')?.textContent).toBe('2.0');
  expect(root.querySelector('a[href="/repositories/detail?repository=github.com%2Facme%2Freturn-navigation"]')).not.toBeNull();
  const facts = root.querySelector('pb-key-value')!.shadowRoot!;
  const repositoryLink = facts.querySelector('a[href="/repositories/detail?repository=github.com%2Facme%2Freturn-navigation"]');
  expect(repositoryLink?.textContent).toBe(repository);
  expect(facts.textContent).toContain('ci@example.com');
  expect(facts.textContent).toContain('GitHub OIDC');
  expect(facts.querySelector('pb-commit-link')).toHaveProperty('commit', expect.stringMatching(/^[0-9a-f]{40}$/));
  expect(facts.textContent).not.toContain('self-asserted');
  expect(pills(root)).toEqual(['PASS', 'Complete', 'Complete']);
  const link = root.querySelector('pb-widget.evidence')?.shadowRoot?.querySelector('pb-section')?.shadowRoot?.querySelector('a[href^="/attestations/"]');
  expect(link?.textContent).toBe('View attestation');
  expect([...root.querySelectorAll<RuleSetChip>('pb-rule-set-chip')].map(chip => chip.label))
    .toEqual(['Repository baseline · 1.0', expect.stringContaining('Security and release readiness')]);
  expect(root.querySelector('.non-passing')).toBeNull();
});

test('names the failing members of an incomplete Rule Set as links to the rule detail', async () => {
  const root = await open(releasePath(repository, '1.11'));
  expect(pills(root)).toEqual(['ERROR', 'Incomplete', 'ERROR']);
  const link = root.querySelector<HTMLAnchorElement>('.non-passing a')!;
  expect(link.getAttribute('href')).toMatch(/^\/rules\/detail\?/);
  expect(link.textContent).toContain('design-review');
});

test('states explicitly that a release has no evidence', async () => {
  const root = await open(releasePath('github.com/acme/missing-evidence', '1.0'));
  expect(pills(root)).toEqual(['No evidence']);
  expect(root.querySelector('pb-rule-set-chip')).toBeNull();
  expect(root.querySelector('pb-widget.evidence')!.shadowRoot!.querySelector('pb-section')!.shadowRoot!.querySelector('a')).toBeNull();
  expect(root.textContent).toContain('No attestation with results at check has been reported for this commit.');
});

test('makes the weaker trust of an API-key sender visible and shows registered text as text', async () => {
  const { repository: markupRepository, version } = (respond('/v0/releases/latest')!.body as { repository: string; version: string }[])
    .find(entry => entry.version.startsWith('release-<'))!;
  const root = await open(releasePath(markupRepository, version));
  const facts = root.querySelector('pb-key-value')!.shadowRoot!;
  expect(pills(facts)).toEqual(['API key']);
  expect(facts.textContent).toContain('self-asserted');
  expect(facts.textContent).toContain(markup);
  expect(root.querySelector('img')).toBeNull();
  expect(facts.querySelector('img')).toBeNull();
  const chip = root.querySelector<RuleSetChip>('pb-rule-set-chip')!;
  await chip.updateComplete;
  expect(chip.shadowRoot?.querySelector('a')?.textContent).toContain('<img');
  expect(chip.shadowRoot?.querySelector('img')).toBeNull();
});

test('reports an unknown release', async () => {
  const root = await mount(releasePath(repository, 'unknown'));
  await vi.waitFor(() => expect(root.querySelector('pb-error-state')).not.toBeNull());
  expect(root.querySelector('pb-error-state')).toHaveProperty('heading', 'Release not found');
});

test('round-trips a release address containing URL delimiters and rejects incomplete ones', () => {
  const address = { repository: 'host/org/repo +?&/#%<b>é', version: 'v1 +?&/#%' };
  expect(routeFor(releasePath(address.repository, address.version))).toEqual({ view: 'release', ...address });
  expect(routeFor('/releases/detail?repository=x').view).toBe('not-found');
  expect(routeFor('/releases/detail?repository=x&version=y&extra=1').view).toBe('not-found');
});
