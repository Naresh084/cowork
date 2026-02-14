# Holdout Benchmark Governance (PM-09)

## Objective

Prevent benchmark overfitting by enforcing hidden holdout scenarios and controlled access policy.

## Policy

1. Public working suite: visible and iterated daily.
2. Holdout suite: hidden from implementation contributors.
3. Holdout results are disclosed only as pass/fail + coarse deltas, not scenario internals.

## Access Control

1. Holdout scenario definitions are limited to `OBS + PM + QA`.
2. Developers receive only failure category tags, never exact prompt/trace fixtures.

## Enforcement

1. Release-gate requires pass on both visible suite and holdout suite.
2. If visible suite improves while holdout degrades, launch is blocked pending investigation.
