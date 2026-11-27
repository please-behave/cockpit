# Components

A component is a cohesive part of the compiled cockpit with one responsibility. The [Why standard](https://github.com/please-behave/why/tree/main/standard) defines the structure.

- Every file below `src` and `frontend/src` and every file the Rust sources embed at compile time belongs to exactly one component. Tests are not components; requirements verify them.
- `files` lists each file by its path from the repository root, without wildcards, so a new file cannot join a component unnoticed. The embedded `frontend/dist` pages are build output and are listed as well.
- A component names the requirements it implements and the components it depends on. Requirements never name components.
- `scope` says what belongs in a component, `out_of_scope` names the owner of a neighboring matter, and `must_not` lists prohibitions that hold even when a task seems to call for them.
- Update the owning component in the same commit that adds, moves or removes a compiled file or a dependency between components.

The `component-consistency` rule verifies ownership, the `depends_on` of the Rust components and the `area` of every requirement. It checks no dependency between TypeScript components, so keep their `depends_on` true by review.
