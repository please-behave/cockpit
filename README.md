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

Open `/sign-in` to sign in with GitHub. Sessions expire after eight hours,
and **Sign out** clears the session from the current browser. The dashboard
shows one tile for the latest reported attestation of each repository and
execution-point combination, with a header counting the tiles that pass and
those that do not. Sort the tiles by last attestation or by name, ignoring case. The sort
choice is the `sort` query parameter. The dashboard refreshes every minute
while the tab is visible. Select a repository to see the rules and outcomes
for that attestation; its back link returns to the dashboard or the
**Attestations** page, wherever you came from. The **Attestations** page lists
every attestation, newest first, and loads older ones in pages of 100 while you
scroll. Going back from a detail page to the **Attestations** page returns to
the same scroll position without loading again; the page is kept in memory only
and **Attestations** in the menu always loads fresh data. If the ledger is unavailable, the view shows an error with a retry
action.

Browser clients can use the [session-protected JSON read API](why/contracts/browser/latest.md).

`GET /healthz` checks liveness. `GET /readyz` confirms the service has loaded
valid configuration and stays available during ledger outages. Startup errors
and service logs are written as JSON to stderr.
