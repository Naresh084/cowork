# Auto Skill Generation and Skill-First Scheduling

## Overview

Cowork now supports conversation-derived skill synthesis for two paths:

1. Manual skill creation from chat context.
2. Scheduled automation creation (`schedule_task`) with mandatory skill usage instructions.

The goal is to preserve reusable execution logic in managed skills (`~/.cowork/skills`) while keeping scheduled prompts compact and deterministic.

## Core Behavior

- `skill-creator` is treated as a bootstrap default and is ensured in managed skills at runtime initialization.
- Skill generation uses the **current session conversation only**.
- Generated skills default to:
  - `lifecycle: draft`
  - `trustLevel: unverified`
- Name collisions use deterministic suffixes (`-v2`, `-v3`, ...).

## Data Flow

1. User asks for skill creation or schedule creation.
2. Sidecar analyzes current session `chatItems` (`user_message` + `assistant_message` text only).
3. Sidecar builds a compact conversation summary (repeated intents, constraints, output preferences).
4. Sidecar generates one or more skill drafts.
5. If create mode is approved, sidecar writes managed skills through `skillService.createSkill(...)`.
6. For scheduled tasks:
   - created skill bindings are injected into `agent_step.config` as `skillBinding` + `skillBindings`.
   - execution prompt includes mandatory skill instructions (`/skills/<name>/SKILL.md`).

## Tool Surface

- `draft_skill_from_conversation`
- `create_skill_from_conversation`
- `schedule_task` (interface unchanged; skill-first behavior is internal)

## IPC Surface

Sidecar handlers:

- `draft_skill_from_session`
- `create_skill_from_session`
- `ensure_default_skill_creator_installed`

Tauri commands:

- `agent_draft_skill_from_session`
- `agent_create_skill_from_session`
- `agent_ensure_default_skill_creator_installed`

## Scheduled Prompt Contract

When skill bindings exist, scheduled agent steps include:

- Mandatory skill path instructions (`/skills/<skill>/SKILL.md`)
- Requirement to read/apply skills before execution
- Trace marker requirement: `Skill used: <skill-name>`
- Fail-closed instruction when required skills are unavailable

This is instruction-based enforcement only; workflow engine execution flow is unchanged.

## Failure Behavior

- If skill generation cannot produce required bindings for scheduling, `schedule_task` fails closed with an actionable error.
- No silent prompt-only fallback for bound schedule runs.

## Lifecycle and Reuse

- Created skills are stored under managed directory and signed.
- They remain available for future sessions and future scheduled workflows.
