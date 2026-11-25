# Registered Rule Sets

`GET /v0/rule-sets` returns HTTP 200 and the JSON array from
`ledger:CON-0011` unchanged. [rule-sets.schema.json](rule-sets.schema.json)
defines the response. The ledger provides one summary per identity, with the
latest version, display name and total member count, including disabled
members. An empty page returns an empty array. Treat stored text as untrusted.

Cockpit forwards `limit` and `before` as in [Registered rules](rules.md).
Build the next cursor from the last Rule Set summary's identity, version and
scan. Use the Rule Set scan for Rule Set pages.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
