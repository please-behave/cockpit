# Rule Set compliance by repository

`GET /v0/rule-sets/compliance` forwards the `source`, `path` and `id`
query parameters to `ledger:CON-0013`. HTTP 200 returns the ledger's JSON array
unchanged. [rule-set-compliance.schema.json](rule-set-compliance.schema.json)
defines the response. The ledger reports an entry for each current repository
and bound version at `check`. It supplies each entry's completeness and
non-passing members. An identity with no current bindings returns an empty
array. Treat stored text as untrusted.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
