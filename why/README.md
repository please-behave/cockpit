# Why

The cockpit keeps its requirements, decisions and API contracts here. See the central [Why repository](https://github.com/please-behave/why) for the documentation approach and shared decisions.

| Artifact | Purpose |
|---|---|
| [Requirement](requirements/README.md) | States a binding, verifiable condition the cockpit must satisfy. |
| [Decision](decisions/schema.json) | Records an architectural choice, its context and its rationale. |
| [API contract](contracts/README.md) | Defines an interface and its obligations within a versioned compatibility boundary. |

Each kind has a `schema.json` in its directory. Name requirement and decision files after their permanent IDs, using `REQ-NNNN.yaml` and `DEC-NNNN.yaml`.

Contracts cite the requirements they specify. Requirements cite the decisions that shaped them. A decision's `supersedes` field cites earlier local decisions it replaces. Requirements may cite decisions in another repository with a qualified ID such as `why:DEC-0002`.

The [`why` rule](../.please/checks/why/rule.toml) validates artifact structure, ID uniqueness and local references at `pre-commit`, `pre-push` and `check`. For qualified references, it checks the ID format.

[API-0001](contracts/browser/api.yaml) defines the Cockpit browser read API.
