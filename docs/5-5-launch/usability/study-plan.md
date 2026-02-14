# Month 9 Usability Study Plan

## Goal

Validate the month-9 UX outcomes and feed structured fixes into iteration cycles:
- onboarding to first-success in <= 3 minutes,
- run-status clarity + recovery usability,
- unified timeline readability under heavy runs,
- artifact navigation scalability.

## Study Cadence

1. Weekly internal study batch (minimum 8 participants).
2. Every batch covers all 5 target flows once per participant.
3. Findings triaged within 24 hours into:
   - `P0`: task blocker / unsafe behavior,
   - `P1`: severe usability failure,
   - `P2`: moderate friction,
   - `P3`: polish.

## Participant Mix

1. 40% power developers.
2. 40% general users.
3. 20% enterprise operators/policy-heavy workflows.

## Scoring Rubric

1. Task success: completed without moderator intervention.
2. Time-on-task: measured start-to-success.
3. Error recovery: number of extra attempts/clicks.
4. Confidence: 1-5 self-rating.
5. Satisfaction: 1-5 post-task rating.

Batch targets:
- overall satisfaction >= 4.6/5,
- >= 90% completion across multi-step flows,
- <= 3 minutes median for flow-1 (onboarding to first run).

## Required Flows Per Session

1. Simple setup -> first successful run.
2. Long run with stall/recovery.
3. Memory-driven continuation and memory feedback.
4. Permission queue handling with pending approvals.
5. Artifact search/pagination and preview behavior with large outputs.

## Output Artifacts

1. Session notes: `docs/5-5-launch/usability/session-notes/<session-id>.md`
2. Batch scores: append row to `docs/5-5-launch/usability/scorecard-template.csv`
3. Findings: append issue to `docs/5-5-launch/usability/findings-log.md`
4. Fix linkage: map findings to task IDs in ledger.
