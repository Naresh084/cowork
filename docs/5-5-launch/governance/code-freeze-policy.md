# Code Freeze and Launch Window Policy

Date: 2026-02-12

## Scope

Defines bug-fix-only window, launch change controls, and defect severity handling for release candidates.

## Policy

1. Enter bug-fix-only mode after release branch cut.
2. New feature work is blocked until release gate returns `pass`.
3. P0/P1 defects can merge during freeze only with explicit owner + test evidence.
4. P2/P3 changes require gate-council approval during freeze.
5. Any failed hard gate moves release state to `blocked` and triggers date slip policy.

## Severity Guardrails

1. P0/P1 must be resolved before candidate promotion.
2. P2 may defer only with explicit mitigation and owner sign-off.
3. P3 deferrals require no gate impact.
