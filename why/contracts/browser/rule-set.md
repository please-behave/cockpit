# Registered Rule Set versions

`GET /v0/rule-sets/detail` takes a Rule Set identity as the query parameters
`source`, `path` and `id`. URL-encode each value as a query parameter.
Cockpit forwards the query to the ledger unchanged.

HTTP 200 returns the JSON array reported by the ledger under
`ledger:CON-0012`, with every registered version of that identity in
ascending numeric version order. [rule-set.schema.json](rule-set.schema.json)
defines the response. Cockpit preserves the ledger's fields, values and order.
Registered text is untrusted. The view reads repository bindings separately
through CON-0008.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.

| Status | JSON body | Meaning |
| --- | --- | --- |
| 400 | `{"code":"invalid_rule_set_identity"}` | The ledger rejected the identity query. |
| 404 | `{"code":"rule_set_not_found"}` | The ledger has no registered versions for this identity. |
