# Latest attestations

Cockpit serves this API to browsers on its own origin. The compatibility
version is recorded in [api.yaml](api.yaml) and appears in the path.

`GET /v0/attestations/latest` returns HTTP 200 and the JSON array reported by
the ledger under `ledger:CON-0002`. [latest.schema.json](latest.schema.json)
defines the summary array. There is one summary per repository and
execution-point combination, in ledger order. An empty ledger returns an empty
array. Fields and values are preserved as reported.

## Session, headers and errors

All endpoints require a live Cockpit session for a currently allowed user.
Responses carry `Content-Type: application/json`, `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and the
Content Security Policy specified by REQ-0004.

| Status | JSON body | Meaning |
| --- | --- | --- |
| 401 | `{"code":"unauthorized"}` | The session is missing, invalid, expired or no longer authorized. |
| 405 | `{"code":"method_not_allowed"}` | The endpoint does not support the requested method. |
| 503 | `{"code":"ledger_unavailable"}` | The ledger request failed, timed out or returned an unexpected response. |

Errors carry no redirect or upstream details. HEAD uses the same status and
headers as GET with an empty body.

Unknown routes under `/v0` return HTTP 404 with `{"code":"route_not_found"}`
regardless of session state. The [frontend API client](../../../frontend/src/api/client.ts)
defines the TypeScript types for the endpoint responses. Update those types
with any change to the response schemas.
