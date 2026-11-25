# Registered rule versions

`GET /v0/rules/detail` takes a rule identity as the query parameters
`source`, `path` and `id`. URL-encode each value as a query parameter.
Cockpit forwards the query to the ledger unchanged.

HTTP 200 returns the JSON array reported by the ledger under
`ledger:CON-0008`, with every registered version of that identity in
ascending numeric version order. [rule.schema.json](rule.schema.json) defines
the response. Cockpit forwards the ledger's fields, values and order intact.
Texts and knowledge are untrusted data and are escaped when rendered.
The optional `owner` is the owner recorded by the ledger for the first
registration of that version. Older ledgers can omit the field.
When present, `rule_sets` lists the set identities and versions that contain
that rule version, as reported by the ledger.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.

| Status | JSON body | Meaning |
| --- | --- | --- |
| 400 | `{"code":"invalid_rule_identity"}` | The ledger rejected the identity query. |
| 404 | `{"code":"rule_not_found"}` | The ledger has no registered versions for this identity. |
