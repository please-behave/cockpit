# Repository Overview

`GET /v0/repositories/overview` returns HTTP 200 with the
[repository overview](repository-overview.schema.json) from `ledger:CON-0024`.
The Cockpit validates the response and preserves the fields, values and order.
The ledger supplies the oldest covering sync completion, repository states,
observed heads and latest reported checks, and excludes archived repositories.
An empty inventory without attestations returns an empty `repositories` array.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
