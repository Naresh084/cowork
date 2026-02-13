# DeepAgents SDK Migration Report (2026-02-13)

## Objective

Migrate the DeepAgents SDK integration to the latest JS release and align skill/tool/file-read behavior with the newest supported capabilities, while avoiding duplicate prompt loading.

## Upstream Release Research (Official Sources)

1. JS SDK releases (repo used by this codebase):
   - https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.7.6
   - https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.7.5
   - https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.7.0
   - Relevant changes include skill middleware hardening, skills-in-subagents support, and sandbox/path reliability fixes.
2. Python SDK releases (reference from request context):
   - https://github.com/langchain-ai/deepagents/releases/tag/deepagents%3D%3D0.4.2
   - https://github.com/langchain-ai/deepagents/releases/tag/deepagents%3D%3D0.4.1
   - Notable items: skill tool-calling rework and native image content blocks in read_file.

## Baseline Before Migration

- `deepagents`: `1.6.1`
- `@langchain/core`: `1.1.17`
- `@langchain/google-genai`: `2.1.14`
- Skills were also inlined into system prompt, causing duplicated skill context when DeepAgents skill loading was active.

## Completed Migration

### 1) SDK + dependency alignment

- Upgraded sidecar dependencies:
  - `deepagents` -> `^1.7.6`
  - `@langchain/core` -> `^1.1.24`
  - `@langchain/google-genai` -> `^2.1.18`
  - `@langchain/openai` -> `^1.2.7`
  - Added explicit `langchain` -> `^1.2.24`
- Resulting resolved versions:
  - `deepagents=1.7.6`
  - `@langchain/core=1.1.24`
  - `langchain=1.2.24`
  - `@langchain/google-genai=2.1.18`

### 2) Skills: tool-driven loading path, no prompt duplication

- Wired native skill-loading input to DeepAgents from currently enabled skill set:
  - Uses `skillService.syncSkillsForAgent(...)` to build virtual `/skills/*/SKILL.md` files.
  - Passes these synced virtual files into `CoworkBackend` for read/glob/grep/readRaw.
- Reduced duplication in prompt construction:
  - When native skills are enabled, system prompt now contains only a compact index of enabled skill names and instructs tool-driven loading, instead of embedding full skill bodies.

### 3) Read-file raw support

- Extended unified file read tool (`read_any_file`) with `raw: boolean`.
- `raw=true` now returns backend raw file payload (`contentLines`, timestamps, joined content), including binary/base64 envelope behavior from backend `readRaw`.

### 4) Backend skill-source dedupe

- `CoworkBackend` now merges skill inputs from:
  - Virtual synced skill files (enabled set)
  - Managed skills directory (fallback/source compatibility)
- Added deterministic dedupe behavior by virtual path.
- Enforced precedence so synced virtual entries remain source-of-truth when the same skill path exists in managed storage.
- Added skill-source coverage to:
  - `lsInfo('/skills/')`
  - `read('/skills/...')`
  - `readRaw('/skills/...')`
  - `globInfo('/skills/**/SKILL.md')`
  - `grepRaw(..., '/skills/')`

### 5) Regression coverage

- Added `agent-runner.skills-prompt.test.ts` to lock compact native-skill prompt behavior and prevent regression to full skill-body inlining when native loading is enabled.
- Extended duplicate-path assertions in `deepagents-backend.test.ts` so stale managed-copy content is not returned by `grepRaw('/skills/')`.
## Files Changed

- `/Users/naresh/Work/Personal/geminicowork/apps/desktop/src-sidecar/package.json`
- `/Users/naresh/Work/Personal/geminicowork/apps/desktop/src-sidecar/src/agent-runner.ts`
- `/Users/naresh/Work/Personal/geminicowork/apps/desktop/src-sidecar/src/deepagents-backend.ts`
- `/Users/naresh/Work/Personal/geminicowork/apps/desktop/src-sidecar/src/deepagents-backend.test.ts`
- `/Users/naresh/Work/Personal/geminicowork/pnpm-lock.yaml`

## Validation

Executed successfully:

```bash
pnpm --filter @gemini-cowork/sidecar typecheck
pnpm --filter @gemini-cowork/desktop typecheck
pnpm --filter @gemini-cowork/sidecar test -- src/deepagents-backend.test.ts src/agent-runner.skills-prompt.test.ts src/agent-runner.integration-stream.test.ts src/agent-runner.run-resume.test.ts src/agent-runner.release-gate.test.ts src/benchmark/runner.regression.test.ts
pnpm audit --audit-level high --prod
```

Current audit status:

- `0 high`
- `0 critical`
- `1 low`, `2 moderate`

## What Was Not Migrated (Not Applicable in this TS Runtime)

- Python-only packages from the upstream mono-repo (`deepagents==0.4.2`, `deepagents-acp`, `deepagents-cli`) were not integrated directly because this application runtime is TypeScript/Node and consumes `deepagents` from npm.
