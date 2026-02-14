# Defect Triage SLA by Severity (PM-12)

## Severity Definitions

1. `P0`: launch blocker / data loss / critical safety or security break.
2. `P1`: major functional break with no acceptable workaround.
3. `P2`: moderate functionality/UX degradation with workaround.
4. `P3`: minor issue or polish item.

## SLA

| Severity | Acknowledge | Owner Assigned | Mitigation Plan | Fix Target |
|---|---|---|---|---|
| P0 | 15 min | 30 min | 2 hours | same day |
| P1 | 30 min | 2 hours | 1 business day | <= 3 days |
| P2 | 1 business day | 2 business days | 3 business days | next sprint |
| P3 | 3 business days | next triage cycle | next triage cycle | backlog |

## Rules

1. P0/P1 always require PM notification and daily status updates.
2. No release allowed with open P0/P1.
3. SLA breaches must be logged in weekly launch-readiness brief.
