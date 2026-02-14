# Release Control Plane (REL-01..REL-04)

Date: 2026-02-12

## REL-01: Internal Feature Flags

- Runtime feature flags are controlled via `apps/desktop/src-sidecar/src/config/feature-flags.ts`.
- `WORKFLOWS_ENABLED` supports environment-controlled hardening and staged internal verification.

## REL-02: Hard Gate Automation

- CI gate workflow: `.github/workflows/quality-gates.yml`.
- Enforced checks:
  1. benchmark regression gate,
  2. reliability E2E gate.
- Release gate assertion path implemented in sidecar/Tauri (`release_gate_assert`, `agent_assert_release_gate`).

## REL-03: Release Slip Policy

- Launch is blocked when any hard gate fails.
- No silent scope cuts to force date compliance.
- Escalation authority remains defined in `docs/5-5-launch/governance/release-gate-authority.md`.

## REL-04: Change Window + Severity Policy

- Freeze policy and defect severity response defined in `docs/5-5-launch/governance/code-freeze-policy.md` and `docs/5-5-launch/governance/defect-triage-sla.md`.
- No release candidate can proceed with unresolved P0/P1.
