# Requirements

A requirement states one binding, verifiable condition the cockpit must satisfy. The [schema](schema.json) defines its fields.

Describe an observable condition that holds across refactorings. Explain why it matters in one sentence in `rationale`. Reference facts defined elsewhere. Tests cite the requirements they verify.

Update affected requirements in the same commit as the code, tests and documentation. Mark historical requirements `obsolete: true`.

Use `decisions` to cite the significant choices that shaped a requirement.
