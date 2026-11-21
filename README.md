# Cockpit

[![build](https://github.com/please-behave/cockpit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/please-behave/cockpit/actions/workflows/ci.yml) [![release](https://img.shields.io/github/v/release/please-behave/cockpit?display_name=tag&sort=semver)](https://github.com/please-behave/cockpit/releases) [![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-3949ab.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

[![tests](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/tests.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![coverage](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/coverage.svg)](https://christianpflugradt.github.io/badges-and-stuff/) [![LOC](https://christianpflugradt.github.io/badges-and-stuff/please-behave-cockpit/loc.svg)](https://christianpflugradt.github.io/badges-and-stuff/)

The cockpit of the Please Behave platform. It is a service in early development.

> Please Behave is in early development and not ready for production use.

It is released as the container image `ghcr.io/please-behave/cockpit`. The purpose and principles of Please Behave are in the [Why repository](https://github.com/please-behave/why).

The cockpit keeps its [requirements, decisions and API contracts](why/README.md) alongside the code.

## Run locally

```sh
COCKPIT_LEDGER_URL=http://127.0.0.1:8081 cargo run --locked
```

Set `COCKPIT_LEDGER_URL` to the ledger's HTTP or HTTPS origin. Set `COCKPIT_BIND_ADDR`
to an IP address and port to override `127.0.0.1:8080`. For a container accepting
connections from outside its network namespace, set it to `0.0.0.0:8080`.

`GET /healthz` checks liveness. `GET /readyz` confirms the service has loaded
valid configuration and stays available during ledger outages. Startup errors
and service logs are written as JSON to stderr.
