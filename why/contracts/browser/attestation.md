# Attestation

`GET /v0/attestations/{id}` takes the attestation UUID in the path. HTTP 200
returns the JSON object reported by the ledger under `ledger:CON-0003`.
[attestation.schema.json](attestation.schema.json) defines its structure.
The object contains the summary fields and the results in reported order.
Fields and values are preserved as reported.

The [session, headers and errors](latest.md#session-headers-and-errors) apply
to this endpoint. An authorized request can also receive these responses.

| Status | JSON body | Meaning |
| --- | --- | --- |
| 400 | `{"code":"invalid_identifier"}` | The path identifier is malformed. |
| 404 | `{"code":"attestation_not_found"}` | The ledger has no attestation with that identifier. |
