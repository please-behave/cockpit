# Current Deployments

`GET /v0/deployments` returns HTTP 200 and the JSON array from
`ledger:CON-0022` unchanged, including each entry's deployment reference and
reported evidence. See the [response schema](deployments.schema.json).

Cockpit forwards the optional `repository`, `limit` and `before` parameters
unchanged. The ledger matches the canonical repository exactly, defaults to
100 entries per page and accepts limits from 1 to 200. For the next page, pass
the last entry's decimal event ID as `before` with the same repository filter.
An empty array means the page is exhausted or there are no deployments in scope.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
