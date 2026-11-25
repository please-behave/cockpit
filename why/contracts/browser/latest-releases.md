# Latest Releases

`GET /v0/releases/latest` returns HTTP 200 and the JSON array from
`ledger:CON-0017` unchanged. The ledger selects the latest release of every
repository with a release by receipt time. Repositories without releases
are absent. See the [response schema](releases.schema.json).

Supply `limit` and `before` as in [repository release history](release-history.md).
The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
