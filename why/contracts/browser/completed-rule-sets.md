# Completed Rule Sets by repository

`GET /v0/repositories/completed-rule-sets` returns HTTP 200 and the array
reported by the ledger under `ledger:CON-0014`.
[completed-rule-sets.schema.json](completed-rule-sets.schema.json) defines the
response. Each entry contains the repository and its completed Rule Sets in
ledger order. Each set carries its bound identity, version and display name.
The ledger omits repositories without completed sets and returns an empty array
when no repositories qualify. Cockpit validates the response and preserves the
ledger's fields, values and order. Treat every stored value as untrusted text.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
