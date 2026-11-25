# Release Detail

`GET /v0/releases/detail?repository=<repository>&version=<version>` returns
HTTP 200 and the JSON object from `ledger:CON-0019` unchanged. See the
[response schema](release.schema.json). The release carries its version,
commit, receipt time and the sender with its authentication method. Its
`evidence` is `null` when no attestation qualifies; otherwise it names the
selected attestation and every Rule Set bound at `check` with its
completeness and non-passing members. Treat stored text as untrusted and
present the evidence as reported.

| Status | Body | Meaning |
|---|---|---|
| 400 | `{"code":"invalid_query"}` | The ledger rejected the query. |
| 404 | `{"code":"release_not_found"}` | The repository and version do not identify a recorded release. |

The [session, headers and errors](latest.md#session-headers-and-errors) apply.
