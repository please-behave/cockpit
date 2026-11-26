import { html, render, type LitElement } from 'lit';
import { afterEach, expect, test } from 'vitest';
import './pb-data-table';
import './pb-empty-state';
import './pb-error-state';
import './pb-fact-strip';
import './pb-status-pill';
import './pb-time';
import './pb-widget';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0004, REQ-0015 and REQ-0016.
test('renders the component catalog and keeps long, markup-like values inert', async () => {
  const longValue = 'x'.repeat(400) + '<img src="/fake-image" onerror="alert(1)">';
  const time = '2026-11-22T19:23:07Z';
  const rows = [{
    key: longValue,
    cells: [longValue, html`<a href="/">Overview</a>`, html`<pb-time .value=${time}></pb-time>`],
  }];

  render(html`
    <pb-status-pill status="PASS"></pb-status-pill>
    <pb-status-pill status="FAIL"></pb-status-pill>
    <pb-status-pill status="ERROR"></pb-status-pill>
    <pb-status-pill status="WARN"></pb-status-pill>
    <pb-status-pill status="NOT_RUN"></pb-status-pill>
    <pb-status-pill .status=${longValue}></pb-status-pill>
    <pb-data-table .label=${longValue} .columns=${[longValue, 'Link', 'Time']}
      .rows=${rows} .rowHeaderColumn=${0}></pb-data-table>
    <pb-data-table .label=${longValue} .columns=${[longValue, 'Link', 'Time']}
      .rows=${rows}></pb-data-table>
    <pb-data-table .label=${longValue} .columns=${[longValue]}></pb-data-table>
    <pb-fact-strip .items=${[{ term: longValue, description: longValue }]}></pb-fact-strip>
    <pb-fact-strip></pb-fact-strip>
    <pb-empty-state .heading=${longValue} .message=${longValue}></pb-empty-state>
    <pb-error-state .heading=${longValue} .message=${longValue}></pb-error-state>
    <pb-error-state .heading=${longValue} .message=${longValue} retryable></pb-error-state>
    <pb-time .value=${time}></pb-time>
    <pb-time .value=${longValue}></pb-time>
    <pb-widget .heading=${longValue} heading-level="3" count="0" accent
      .link=${{ href: '/rules', label: longValue }}>
      <a href="/rules/detail">View rule</a>
    </pb-widget>
    <pb-widget heading="Overview"></pb-widget>
  `, document.body);

  const components = document.body.querySelectorAll<LitElement>('pb-status-pill, pb-data-table, '
    + 'pb-fact-strip, pb-empty-state, pb-error-state, pb-time, pb-widget');
  await Promise.all([...components].map(component => component.updateComplete));

  const roots = (tag: string) => [...document.body.querySelectorAll(tag)].map(element => element.shadowRoot!);
  const [pass, fail, error, warn, notRun, unknown] = roots('pb-status-pill');
  expect([pass, fail, error, warn, notRun, unknown].map(root => root.querySelector('.pill span:last-child')?.textContent))
    .toEqual(['PASS', 'FAIL', 'ERROR', 'WARN', 'NOT_RUN', longValue]);
  const [withRowHeader, plainTable, noRows] = roots('pb-data-table');
  expect(withRowHeader.querySelector('caption')?.textContent).toBe(longValue);
  expect(withRowHeader.querySelector('thead th')?.textContent).toBe(longValue);
  expect(withRowHeader.querySelector('tbody th')?.textContent).toBe(longValue);
  expect(plainTable.querySelector('tbody td')?.textContent).toBe(longValue);
  expect(noRows.querySelector('tbody')?.children).toHaveLength(0);
  expect(plainTable.querySelector('td a')?.textContent).toBe('Overview');
  const nestedTime = plainTable.querySelector<LitElement>('td pb-time')!;
  await nestedTime.updateComplete;
  expect(nestedTime.shadowRoot!.querySelector('time')?.dateTime).toBe(time);
  const [definitions, noDefinitions] = roots('pb-fact-strip');
  expect(definitions.querySelector('dt')?.textContent).toBe(longValue);
  expect(definitions.querySelector('dd')?.textContent).toBe(longValue);
  expect(noDefinitions.querySelector('dl')?.children).toHaveLength(0);
  const [emptyState] = roots('pb-empty-state');
  const [errorState, retryState] = roots('pb-error-state');
  for (const root of [emptyState, errorState, retryState]) {
    expect(root.querySelector('h2')?.textContent).toBe(longValue);
    expect(root.querySelector('p')?.textContent).toBe(longValue);
  }
  expect(errorState.querySelector('button')).toBeNull();
  expect(retryState.querySelector('button')?.textContent).toBe('Retry');
  const [validTime, invalidTime] = roots('pb-time');
  expect(validTime.querySelector('time')?.dateTime).toBe(time);
  expect(invalidTime.querySelector('span')?.textContent).toBe(longValue);

  const [widget, minimalWidget] = roots('pb-widget');
  const region = widget.querySelector('section')!;
  const heading = widget.querySelector('h3')!;
  expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
  expect(heading.textContent).toBe(longValue);
  expect(widget.querySelector('.count')?.textContent).toBe('0');
  expect(widget.querySelector('header a')?.getAttribute('href')).toBe('/rules');
  expect(widget.querySelector('header a')?.textContent).toBe(longValue);
  expect(widget.querySelector<HTMLSlotElement>('slot:not([name])')?.assignedElements()[0]?.textContent)
    .toBe('View rule');
  expect(widget.host.hasAttribute('accent')).toBe(true);
  expect(minimalWidget.querySelector('h2')?.textContent).toBe('Overview');
  expect(minimalWidget.querySelector('.count, header a')).toBeNull();
  expect(minimalWidget.host.hasAttribute('accent')).toBe(false);

  for (const component of components) {
    expect(component.shadowRoot!.querySelector('img, [onerror]')).toBeNull();
  }
});
