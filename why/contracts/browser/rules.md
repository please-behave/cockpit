# Registered rules

`GET /v0/rules` returns HTTP 200 with the JSON array reported by the ledger
under `ledger:CON-0007`. [rules.schema.json](rules.schema.json) defines the
response. The array has one summary per identity and describes each rule's
latest registered version. An empty page returns an empty array.
The optional `owner` is the registering owner of the greatest version as
reported by the ledger. Older ledgers can omit the field. Treat the value
as untrusted text.

The list also preserves the ledger's `rule_sets` memberships. Each entry
names the identity and greatest version of a set that contains the exact
rule version in the summary. An empty array indicates a local rule. Older
ledgers can omit the field. The grouped Rules view uses membership data when
there are registered sets.

Cockpit forwards the ledger's `limit` and `before` query unchanged. The limit
is an integer from 1 to 200 and defaults to 100. To continue a full page,
copy the last summary's `source`, `path`, `id`, `version` and `scan` into
the URL-encoded JSON object in `before`. The `scan` object contains the
inclusive registration time bound (`through`, in integer microseconds
since the Unix epoch) and the registration count (`registrations`).
A shorter page ends the scan. Cockpit forwards the ledger's fields and
values intact, in the display-name order defined by `ledger:CON-0007`.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
