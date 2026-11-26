# Attestation list

`GET /v0/attestations` returns HTTP 200 and the JSON array reported by the
ledger under `ledger:CON-0004`. [list.schema.json](list.schema.json) defines the
summary array. The summaries are ordered from newest to oldest and the array is
empty when nothing matches. Fields, values and order are preserved as reported.

| Query parameter | Meaning |
| --- | --- |
| `limit` | The greatest number of summaries to return, an integer from 1 to 200. The ledger defaults it to 100. |
| `before` | A UUID. Only attestations with a smaller identifier are returned. Without it the page starts at the newest attestation. |
| `repository` | A URL-encoded normalized repository identity. Only attestations with the exact stored identity match. Omit it to include all repositories. |

Cockpit forwards the query to the ledger unchanged and does not validate it. A
reader pages by passing the identifier of the last summary it received as
`before` and retaining the same `repository` filter when present. A page
with fewer summaries than `limit` is the last one.

The [session, headers and errors](latest.md#session-headers-and-errors) apply
to this endpoint. An authorized request can also receive this response.

| Status | JSON body | Meaning |
| --- | --- | --- |
| 400 | `{"code":"invalid_query"}` | The ledger rejected the query. |
