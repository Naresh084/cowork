---
name: help
displayName: Help
description: Show available slash commands
aliases:
  - "?"
  - commands
category: utility
icon: help-circle
priority: 90
metadata:
  author: gemini-cowork
  version: "1.0.0"
  emoji: ❓
---

Here are the available slash commands:

## Setup Commands
- **/init** (aliases: /initialize, /setup) - Generate an AGENTS.md project context file with smart detection of your tech stack, conventions, and architecture

## Memory Commands
- **/memory** (aliases: /mem, /memories) - Manage long-term memories stored in .cowork/memories/

## Utility Commands
- **/help** (aliases: /?, /commands) - Show this help message
- **/clear** (aliases: /cls, /reset) - Clear the current conversation

## Tips
- Type "/" to see command suggestions with autocomplete
- You can add additional instructions after any command
- Example: "/init focus on the API layer and authentication flow"
- Commands expand to detailed prompts - you'll see exactly what's sent
