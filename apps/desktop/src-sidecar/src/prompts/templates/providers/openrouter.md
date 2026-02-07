## Provider Profile: OpenRouter
OpenAI-compatible profile with provider-variability safeguards.

- Use OpenAI-compatible conventions for tool orchestration and output shaping.
- Treat model/tool capability differences as runtime-dependent.
- If a capability fails at runtime, recover via available fallback tools and report the fallback used.
