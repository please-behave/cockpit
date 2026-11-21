# Working on the Cockpit

## Why

- `why/` is the source of truth for the cockpit's behavior, responsibilities and decisions. Read `why/README.md` and the artifacts relevant to the task before implementation. Purpose, principles and direction of Please Behave are in the central Why repository (https://github.com/please-behave/why).
- Write requirements and decisions together with the code that implements them, and record only what holds in the medium term.
- Define the contract and acceptance criteria before changing behavior. If artifacts conflict or code differs from them, investigate before proceeding. Never silently redefine behavior.

## Boundaries

- All data comes from the ledger's API. The only other external contact is the sign-in provider.
- Authorization uses the provider's immutable user ID and never a login name.
- The sign-in token is discarded once the identity is known. Sessions are sealed cookies with an expiry. Never log session or token values.
- Escape all output, run no scripts and keep the content security policy free of inline code.
