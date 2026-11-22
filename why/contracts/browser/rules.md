# Registered rules

`GET /v0/rules` returns HTTP 200 with the JSON array reported by the ledger
under `ledger:CON-0007`. [rules.schema.json](rules.schema.json) defines the
response. The array has one summary per identity and describes each rule's
latest registered version. An empty page returns an empty array.

Cockpit forwards the ledger's `limit` and `before` query unchanged. The limit
is an integer from 1 to 200 and defaults to 100. To continue a full page,
pass the last summary's `source`, `path` and `id` as a URL-encoded JSON
object in `before`. A shorter page ends the scan. Cockpit forwards the
ledger's fields, values and order intact.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
