# Cowork Get Started Guide (Multi-Provider)

This guide covers the current multi-provider onboarding and settings flow in the desktop app, including how each setting affects tool registration and runtime behavior.

## 1. Provider Support

Supported providers:

- `google`
- `openai`
- `anthropic`
- `openrouter`
- `moonshot` (Kimi)
- `glm`
- `deepseek`
- `lmstudio`

Base URL editability:

- Fixed base URL: `google`, `openai`, `anthropic`
- Editable base URL: `openrouter`, `moonshot`, `glm`, `deepseek`, `lmstudio`

## 2. Onboarding Flow

Onboarding UI is provider-first and includes required + optional setup.

Required steps:

1. Enter name.
2. Select provider.
3. Enter provider API key.
   - For `lmstudio`, provider key is optional.
4. Optionally set provider base URL (editable providers only).
5. Select chat model or enter custom model ID.

Optional onboarding sections:

- Media setup:
  - Google media key
  - OpenAI media key
  - Fal media key
  - Google/OpenAI/Fal image + video model overrides
  - Image backend routing (`google` / `openai` / `fal`)
  - Video backend routing (`google` / `openai` / `fal`)
- Capability setup:
  - External fallback search provider (`google` / `exa` / `tavily`)
  - Exa key
  - Tavily key
  - Stitch key
  - Google `computer_use` model override
  - Google `deep_research` model override

On submit, onboarding validates provider connection, persists keys/models/settings, and applies runtime config immediately.

## 3. Settings Flow (3 Tabs)

Settings tabs:

1. `Provider`
2. `Media`
3. `Integrations`

### 3.1 Provider Tab

Contains:

- Active provider selector
- Active provider key (scoped per provider)
- Provider base URL override (editable providers only)

Effect on runtime/tools:

- Provider key updates can apply immediately.
- Provider switch and base URL changes can require a new session for full runtime consistency.
- Model list is refreshed for active provider after key/base URL changes.

### 3.2 Media Tab

Contains:

- Image backend routing toggle (`google` / `openai` / `fal`)
- Video backend routing toggle (`google` / `openai` / `fal`)
- Media API keys:
  - Google media key
  - OpenAI media key
  - Fal media key
- Model overrides:
  - Google image model
  - Google video model
  - OpenAI image model
  - OpenAI video model
  - Fal image model
  - Fal video model

Effect on runtime/tools:

- Controls backend for unified tools:
  - `generate_image`
  - `edit_image`
  - `generate_video`
- Media key/model changes apply to subsequent media tool calls.

Auto-default behavior:

- If media routing has not been customized yet:
  - Active provider `openai` defaults media routing to OpenAI.
  - Other providers default media routing to Google.

### 3.3 Integrations Tab

Contains:

- Fallback web search provider selector (shown when active provider lacks native search):
  - `google`
  - `exa`
  - `tavily`
- Exa key (only needed when fallback provider is Exa)
- Tavily key (only needed when fallback provider is Tavily)
- Stitch key (controls Stitch MCP tool availability)
- Google specialized model overrides:
  - `computer_use`
  - `deep_research`
- Shared integration working directory defaults
- WhatsApp / Slack / Telegram integration sections

Effect on runtime/tools:

- External search fallback affects `web_search` when provider-native search is unavailable.
- Stitch tools are only registered when Stitch key exists.
- Computer-use/deep-research model fields control those tool model IDs.

## 4. Runtime Apply vs New Session

### Applies immediately

- Provider key rotations (same provider), when no provider/base URL boundary change occurs
- Media backend/key/model updates (take effect for next media call)
- Exa/Tavily fallback provider/key changes
- Stitch key updates
- Specialized model overrides

### New session recommended/required

- Provider changed
- Active provider base URL changed
- Active chat model changed

UI behavior:

- Runtime returns impact metadata.
- Chat header shows `Start new session` notice when required.

## 5. Tool Registration Rules

Tools are conditionally registered from current runtime config. If required keys are missing, tools are not registered (instead of failing later at runtime).

Always available:

- `read_any_file`

Conditional tools:

- `web_search`
  - Uses provider-native search when supported and key is available.
  - Falls back to Exa/Tavily if configured with key.
  - Falls back to Google if Google key exists.
- `google_grounded_search`
  - Compatibility alias to `web_search`.
- `web_fetch`
  - `anthropic`: Anthropic web fetch tool
  - `glm`: GLM web reader tool
  - Others: Google URL-context fetch fallback
- `generate_image` / `edit_image`
  - Routed by image backend setting.
- `generate_video`
  - Routed by video backend setting.
- `analyze_video`
  - Available if OpenAI or Google media key path is available.
- `computer_use`
  - Provider-native for Google/OpenAI/Anthropic.
  - Google fallback path for other providers when Google key is configured.
- `deep_research`
  - Google-key-backed.

System prompt tool list:

- Tool instructions in system prompt are generated from currently registered tools only.
- Missing keys => tool omitted from registration and prompt tool section.

## 6. Provider Defaults With No Extra Google/OpenAI/Fal Keys

Assumption:

- User has only the active provider key configured.
- No extra Google/OpenAI/Fal media keys.
- No Exa/Tavily keys unless stated.

### Google

- Works: chat, `web_search`, `web_fetch`, `computer_use`, `deep_research`, media tools (default Google backend).

### OpenAI

- Works: chat, `web_search`, `computer_use`, media tools (default OpenAI backend when media routing not yet customized), `analyze_video`.
- Does not work without Google key: `web_fetch` fallback path.

### Anthropic

- Works: chat, `web_search`, `web_fetch` (Anthropic), `computer_use`.
- Does not work without Google key: Google-backed media/deep research.

### Moonshot (Kimi)

- Works: chat, `web_search`.
- Requires Google key for: `web_fetch`, fallback `computer_use`, default Google media path.

### GLM

- Works: chat, `web_search`, `web_fetch` (GLM web reader).
- Requires Google key for: fallback `computer_use`, default Google media path.

### DeepSeek

- Works: chat.
- `web_search` works only with configured external fallback (Exa/Tavily + key) or Google key fallback.
- Requires Google key for: `web_fetch`, fallback `computer_use`, default Google media path.

### OpenRouter

- Works: chat.
- `web_search` works only with configured external fallback (Exa/Tavily + key) or Google key fallback.
- Requires Google key for: `web_fetch`, fallback `computer_use`, default Google media path.

### LM Studio

- Works: chat with local server (provider key optional depending on local setup).
- `web_search` works only with configured external fallback (Exa/Tavily + key) or Google key fallback.
- Requires Google key for: `web_fetch`, fallback `computer_use`, default Google media path.

## 7. Model Listing Behavior

Model listing in UI is provider-aware (`availableModelsByProvider` + `selectedModelByProvider`).

Primary behavior:

- For non-`lmstudio` providers, UI fetches models after provider key is present.
- UI requests models through `fetch_provider_models`.
- Custom model IDs can always be added and selected.

Fallback behavior:

- If model API works: API models are returned.
- If model API is unreliable/unavailable:
  - `glm`: curated catalog path.
  - `moonshot`, `deepseek`, `lmstudio`: curated fallback when endpoint fails.

Curated fallback examples:

- Moonshot: `kimi-k2.5`, `kimi-k2-0905-preview`, `kimi-k2-thinking`, etc.
- GLM: `glm-4.7`, `glm-4.6`, `glm-4.5`, `glm-4.6v`, `glm-ocr`, etc.
- DeepSeek: `deepseek-chat`, `deepseek-reasoner`.
- LM Studio: `local-model` placeholder.

Context/output metadata:

- Curated GLM entries include `contextWindow=200000` and `maxTokens=131072` where applicable.
- Curated DeepSeek and Moonshot entries include provider-specific context sizing.

## 8. Key Storage

Credentials are stored in the system credential manager via Tauri/Rust commands.

Key families:

- Provider keys: one per provider (`provider_api_key_<provider>`)
- Google key: capability/media key
- OpenAI key: capability/media key
- Fal key: media generation key
- Exa key: external search fallback
- Tavily key: external search fallback
- Stitch key: Stitch MCP capability

Legacy compatibility:

- Legacy Gemini key path is mapped to Google provider key for backward compatibility.
