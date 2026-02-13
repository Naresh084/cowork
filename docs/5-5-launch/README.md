# Gemini Cowork 5/5 Launch - Internal Execution System

Date created: 2026-02-12  
Scope: Twin-Track benchmark domination blueprint  
Program horizon: 12 months  
Launch model: single public big-bang launch after internal phased hardening

## Purpose

This folder is the execution control-plane for the full 5/5 blueprint.

Use it to:
1. Track every task, dependency, acceptance gate, and evidence artifact.
2. Prevent scope loss across long-running implementation.
3. Enforce quality-first release conditions (no critical regressions accepted).

## Files in This Folder

1. `docs/5-5-launch/internal-master-tasks.md`
   - Human-readable master plan with governance, phase sequencing, workstream checklists, exit criteria, and operating rules.

2. `docs/5-5-launch/task-ledger.csv`
   - Machine-readable task ledger containing all tracked items.
   - Designed for filtering by `status`, `workstream`, `phase`, `month_target`, and `owner`.

3. `docs/5-5-launch/progress-log.md`
   - Running implementation journal and decision log.

4. `docs/5-5-launch/evidence/`
   - One evidence file per completed task.
   - Naming convention: `<task_id>.md`.

## Status Vocabulary (Locked)

- `not_started`
- `in_progress`
- `blocked`
- `in_review`
- `done`

No other status values are allowed.

## Priority Vocabulary (Locked)

- `P0` critical path, launch-blocking
- `P1` high impact
- `P2` important depth improvement
- `P3` optimization/polish

## Evidence Rule (Mandatory)

A task cannot move to `done` unless a matching file exists at:
- `docs/5-5-launch/evidence/<task_id>.md`

Each evidence file must include:
1. Change summary
2. Files changed
3. Verification commands
4. Verification output summary
5. Acceptance result mapping to plan criteria
6. Risks remaining
7. Rollback path

## Operating Cadence

1. Daily
   - Update `task-ledger.csv` statuses.
   - Add one `progress-log.md` entry.

2. Weekly
   - Recompute benchmark and score trend fields.
   - Validate launch gate trajectory.

3. Monthly
   - Close month-phase exit criteria in `internal-master-tasks.md`.
   - Freeze carry-over list before next month starts.

## Gate Policy

Public launch is blocked unless all are true:
1. 3 consecutive benchmark passes satisfy threshold contract.
2. All Must-Have feature tasks are `done`.
3. No open P0/P1 defects.
4. Security audit unresolved critical/high = 0.
5. Release gate status = `pass`.

