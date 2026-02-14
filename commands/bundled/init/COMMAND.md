---
name: init
displayName: Initialize Project
description: Generate an AGENTS.md file for this project
aliases:
  - initialize
  - setup
category: setup
icon: file-plus
priority: 100
metadata:
  author: cowork
  version: "1.0.0"
  emoji: 🚀
---

Generate a comprehensive AGENTS.md file for this project.

IMPORTANT INSTRUCTIONS:

1. ANALYZE the project structure by examining:
   - Package files (package.json, pyproject.toml, Cargo.toml, go.mod, pom.xml)
   - Configuration files (.eslintrc, tsconfig.json, prettier.config.js, etc.)
   - Directory structure and naming conventions
   - README.md if present
   - Source code patterns (first few files in src/)

2. CREATE an AGENTS.md file at the project root with these sections:

## Project Overview
[Project name, purpose, and what it does in 2-3 sentences]

## Tech Stack
| Component | Technology |
|-----------|------------|
| Language | [detected language(s)] |
| Framework | [detected framework] |
| Build Tool | [detected build tool] |
| Package Manager | [npm/pnpm/yarn/pip/cargo/etc.] |
| Testing | [detected test framework] |

## Architecture
[Brief description of architecture pattern - MVC, Clean Architecture, Monorepo, etc.]

### Directory Structure
```
project-root/
├── src/           # [purpose]
├── tests/         # [purpose]
└── ...
```

## Key Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| [etc.] |

## Coding Standards
- [Detected indentation style]
- [Naming conventions: camelCase, snake_case, etc.]
- [Import style and organization]
- [Any linting rules detected]

## Important Files
- [Entry point file]
- [Main config file]
- [Key module files]

## Agent Guidelines
### Do
- Follow existing patterns and conventions in this codebase
- Use the established utilities and helpers
- Match the existing code style exactly
- Write tests for new functionality

### Don't
- Introduce new dependencies without asking
- Change existing APIs without a migration plan
- Skip error handling
- Over-engineer solutions

3. WRITE the file to AGENTS.md in the project root

4. SHOW a summary of what was detected and created

Note: If AGENTS.md already exists, show its contents and ask before overwriting.
