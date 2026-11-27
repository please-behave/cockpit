# Cockpit

[![build](https://github.com/please-behave/cockpit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/please-behave/cockpit/actions/workflows/ci.yml) [![release](https://img.shields.io/github/v/release/please-behave/cockpit?display_name=tag&sort=semver)](https://github.com/please-behave/cockpit/releases) [![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-3949ab.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

[![tests](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/tests.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![coverage](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/coverage.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![LOC](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/loc.svg)](https://christianpflugradt.github.io/badges-and-stuff/)

The cockpit of the Please Behave platform. It is a service in early development.

> Please Behave is in early development and not ready for production use.

It is released as the container image `ghcr.io/please-behave/cockpit`. The purpose and principles of Please Behave are in the [Why repository](https://github.com/please-behave/why).

The cockpit keeps its [requirements, decisions and API contracts](why/README.md) alongside the code.

## Build and test

From a fresh checkout, run:

```sh
mise install
mise run setup
mise exec -- cargo test --locked
```

Setup installs frontend dependencies from `frontend/package-lock.json`, builds
`frontend/dist`, and fetches locked Cargo dependencies. The Rust build embeds
the Vite application shell, sign-in page and assets at compile time. Run `mise run frontend-build`
after editing the frontend and before invoking Cargo directly. `mise run build`
builds the frontend and the release executable in that order. CI uses the
setup task, and the container build generates the assets in its Node stage.

Frontend type checks and tests can also run on their own:

```sh
mise exec -- npm --prefix frontend run typecheck
mise exec -- npm --prefix frontend test
```

Preview the frontend with fixture data, without a ledger, database, network
or sign-in:

```sh
mise run preview
```

The task builds the frontend and serves it at `http://127.0.0.1:8090/` (set
`PREVIEW_PORT` to change the port). `tools/preview/` answers the read API with
fixtures for every view, including repository health states, several execution points,
verified and unverified results, rule versions, very long texts and markup.
Open `/preview/repository-map` to exercise the repository map widget on its own.
Open `/preview/review` to see every fixture view in light and dark at widths of
1440, 1024, 640 and 320 CSS pixels. The measurements table reports how many
entries fit in the initial 900-pixel viewport, header and toolbar heights,
how many rendered entries have wrapped text, and page-level horizontal
overflow. Each view lists the entries it counts. The frames scroll independently,
and each row of frames can be scrolled horizontally. The 640-pixel width
represents 200% zoom in a 1280-pixel window. Compare in the same browser with
the same settings and fixture data.

The same manifest includes the detail routes and fixed empty, error, long-value
and volume fixtures. The consistency inventory samples 1440 and 320 CSS pixels
in both themes, with one 320-pixel light frame per volume fixture. It groups
outcomes, classifications and object references by
their computed styling, lists visible time and version formats, and probes
controls with focus and hover to find popups that repeat visible text. Expand
an inventory group to see examples and counts for each view.

Open `/?preview=volume` (or `/attestations`, `/releases` and `/deployments` with the
same parameter) to review the volume scenario. A seeded generator builds
1,000 repositories, 20,000 attestations, their releases, deployments across
several targets and completed Rule Sets in memory on the first request. Most
repositories are current, a few fail and some are overdue, never integrated,
unknown or unmanaged. The same seed gives identical responses, and nothing is
committed. The generated lists page exactly as the read contracts define, so
endless scrolling and the loops over every page run for real. Other parameters
are optional: `seed` (default 1), `repositories` (1 to 5,000, default 1,000),
`attestations` (0 to 100,000, default 20,000) and `delay`, the milliseconds
every response waits (0 to 5,000), which makes sequential page reads visible.
Views without generated data, such as rules, keep their hand-written fixtures.

The preview is a developer tool and is not part of the executable.

The executable serves the content-hashed bundles from `/assets/` and the Vite
sign-in page from `/sign-in`. Signed-in viewers get the application shell on
page routes, including direct links to individual attestations. The browser
handles navigation and shows a page-not-found view for unknown page addresses.
The application shell and sign-in page share the
[Please Behave visual identity](https://github.com/please-behave/why/blob/main/brand/README.md)
and follow the browser's color scheme until the viewer picks the light or dark
theme with the button in the navigation. The choice is kept in the browser's
local storage.

## Run locally

Register a [GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
and set its callback to the Cockpit HTTPS URL followed by `/sign-in/callback`.
Serve the Cockpit over HTTPS through a reverse proxy for browser sign-in.

| Required setting | Value |
| --- | --- |
| `COCKPIT_LEDGER_URL` | The ledger's HTTP or HTTPS origin, for example `http://127.0.0.1:8081`. |
| `COCKPIT_GITHUB_CLIENT_ID` | The GitHub OAuth app's client ID. |
| `COCKPIT_GITHUB_CLIENT_SECRET` | The GitHub OAuth app's client secret. |
| `COCKPIT_GITHUB_CALLBACK_URL` | The registered HTTPS callback URL, for example `https://cockpit.example.com/sign-in/callback`. |
| `COCKPIT_COOKIE_KEY` | 64 random bytes encoded as 128 hex digits. Generate it with `openssl rand -hex 64` and give every instance of the deployment the same key. |
| `COCKPIT_GITHUB_ALLOWED_IDS` | A comma-separated list of positive numeric GitHub user IDs, for example `12345,67890`. |

After setup, set those variables in the process environment before running:

```sh
mise exec -- cargo run --locked
```

Set `COCKPIT_BIND_ADDR` to an IP address and port to override
`127.0.0.1:8080`. For a container accepting
connections from outside its network namespace, set it to `0.0.0.0:8080`.

Open `/sign-in` to sign in with GitHub. See the
[Cockpit guide](https://github.com/please-behave/docs/blob/main/src/cockpit.md)
for the dashboard and evidence views.

Browser clients can use the [session-protected JSON read API](why/contracts/browser/latest.md).

`GET /healthz` checks liveness. `GET /readyz` confirms the service has loaded
valid configuration and stays available during ledger outages. Startup errors
and service logs are written as JSON to stderr.
