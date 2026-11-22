# Cockpit

[![build](https://github.com/please-behave/cockpit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/please-behave/cockpit/actions/workflows/ci.yml) [![release](https://img.shields.io/github/v/release/please-behave/cockpit?display_name=tag&sort=semver)](https://github.com/please-behave/cockpit/releases) [![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-3949ab.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

[![tests](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/tests.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![coverage](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/coverage.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![LOC](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/loc.svg)](https://christianpflugradt.github.io/badges-and-stuff/)

The cockpit of the Please Behave platform. It is a service in early development.

> Please Behave is in early development and not ready for production use.

It is released as the container image `ghcr.io/please-behave/cockpit`. The purpose and principles of Please Behave are in the [Why repository](https://github.com/please-behave/why).

The cockpit keeps its [requirements, decisions and API contracts](why/README.md) alongside the code.

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

Set those variables in the process environment before running:

```sh
cargo run --locked
```

Set `COCKPIT_BIND_ADDR` to an IP address and port to override
`127.0.0.1:8080`. For a container accepting
connections from outside its network namespace, set it to `0.0.0.0:8080`.

Open `/sign-in` to sign in with GitHub. Sessions expire after eight hours,
and **Sign out** clears the session from the current browser. The overview
shows the latest reported attestation for each repository and execution-point
combination, with errors and failures first. Select a repository link to see
the rules and outcomes for that attestation.

Browser clients can use the [session-protected JSON read API](why/contracts/browser/latest.md).

`GET /healthz` checks liveness. `GET /readyz` confirms the service has loaded
valid configuration and stays available during ledger outages. Startup errors
and service logs are written as JSON to stderr.
