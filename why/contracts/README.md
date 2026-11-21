# API contracts

Each API defines a compatibility boundary between a producer and its consumers. Its directory contains an `api.yaml` index that follows [schema.json](schema.json). The index has a permanent `API-NNNN` ID, a name, a nonnegative integer compatibility version and at least one contract. All contracts in that index share its version.

Each contract has a permanent `CON-NNNN` ID, a name, a Markdown document, an optional structural JSON schema and the local requirements it specifies. IDs are unique across all API indices. Document and schema paths are relative to the index and must stay inside its directory. Use regular paths without symbolic links.

The structural schema defines fields, types and constraints it can express. The Markdown document defines meaning, sequencing, errors and any conditions that require further validation. Resolve contradictions between contracts and requirements with the owner.
