# Repository Release History

`GET /v0/releases?repository=<repository>` returns HTTP 200 and the JSON
array from `ledger:CON-0018` unchanged, newest receipt first. An unknown
repository or exhausted page returns an empty array. The
[response schema](releases.schema.json) defines the summaries. A release
with no qualifying evidence has `evidence: null`. Treat stored text as
untrusted and present the evidence as reported.

Both release reads forward the optional `limit` (1–200, default 100) and
exclusive `before` cursor. For a next page, URL-encode the last summary's
repository and version as a JSON object with keys `repository` and
`version`. A history cursor belongs to the requested repository.

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
A rejected query returns HTTP 400 with `{"code":"invalid_query"}`.
