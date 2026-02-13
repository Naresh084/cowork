# Release Gate Authority and Escalation Tree (PM-06)

## Gate Authority

1. Final go/no-go authority: `PM + OBS + SEC` joint signoff.
2. Any veto by `SEC` on unresolved critical/high findings blocks launch.
3. Any veto by `OBS` on benchmark gate failure blocks launch.

## Escalation Path

1. Assignee raises blocker -> Workstream Lead.
2. Workstream Lead -> PM within 2 hours if P0/P1.
3. PM convenes Gate Council (`PM, OBS, SEC, RUNTIME`) within same day.
4. Council decides:
   - accept with remediation window,
   - block release,
   - re-scope only non-must-have items.

## Non-negotiables

1. No launch with open P0/P1.
2. No launch with failed release gate.
3. No launch with unresolved critical/high security findings.
