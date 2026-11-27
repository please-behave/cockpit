# Why

The cockpit keeps its requirements, decisions and API contracts here. See the central [Why repository](https://github.com/please-behave/why) for the documentation approach and shared decisions.

| Artifact | Purpose |
|---|---|
| [Requirement](requirements/README.md) | States a binding, verifiable condition the cockpit must satisfy. |
| [Component](components/README.md) | Maps the compiled files to one responsibility each, with boundaries and the requirements they implement. |
| [Decision](https://github.com/please-behave/why/blob/main/standard/decision.schema.json) | Records an architectural choice, its context and its rationale. |
| [API contract](contracts/README.md) | Defines an interface and its obligations within a versioned compatibility boundary. |

The [Why standard](https://github.com/please-behave/why/tree/main/standard) defines the permitted structure of each kind. Name requirement, decision and component files after their permanent IDs, using `REQ-NNNN.yaml`, `DEC-NNNN.yaml` and `COMP-NNNN.yaml`.

Components and contracts cite the requirements they implement or specify. Requirements cite the decisions that shaped them. A decision's `supersedes` field cites earlier local decisions it replaces. Requirements may cite decisions in another repository with an ID qualified by the alias that [`repositories.yaml`](repositories.yaml) declares for it, such as `why:DEC-0002`.

The `why` ruleset of the repository catalog validates artifact structure, ID uniqueness, local references and the aliases of qualified references at `pre-commit`, `pre-push` and `check`.

[API-0001](contracts/browser/api.yaml) defines the Cockpit browser read API.
