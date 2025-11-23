# Opencode Agent Instructions for langBro Extension

## Software Engineering Principles
- **Modularity**: Organize code into files by responsibility (e.g., utils, models).
- **Minimalism**: Write only purposeful code—follow YAGNI principles.
- **Readability**: Use descriptive names, follow style guides, concise comments only if requested.
- **Robustness**: Implement targeted error handling.
- **Efficiency**: Optimize judiciously.
- **Planning**: Outline steps before major changes.
- **Code Changes**: Prefer minimal, targeted modifications.
- **Simple Solutions**: Always prefer the simplest solution that works. Avoid over-engineering.
- **User-Centric**: Be responsive to feedback, implement simpler approaches when suggested.

## Project-Specific Rules
- **Build Commands**:
  - Use `npm run build:dev` for development (preserves source maps).
  - Avoid `npm run build:rxjs`.
  - Firefox extension: `node build-ff-ext.js` after code changes.
  - Do not generate .xpi files.
- **Manifest Changes**: CRITICAL: If `manifest.json` is modified, restart Firefox for changes to take effect!
- **Settings Management**: In `content-rxjs.js`, use reactive `settings` from `./settings-store.js`.
- **Code Reuse**: Create reusable functions for repeated patterns.
- **Source Code Build**: Run `node build-ff-ext-src.js` only if explicitly requested. Ensure README.md has up-to-date instructions first.

## Workflow Management
- **Versioning** (`z_version_nr.txt`):
  - Increment by 0.0.1 after code changes.
  - Increment by 0.1 for new conversation threads.
  - Skip for planning/questions.
- **Post-Change Actions**: After EVERY code change:
  1. Bump version in `z_version_nr.txt` by 0.0.1.
  2. Run `node build-ff-ext.js`.
- **Verification**: After changes, run lint/typecheck if available (check package.json scripts).

## Opencode-Specific
- Follow opencode commit/PR guidelines.
- Use todo list for multi-step tasks.
- Search codebase extensively before changes.
- Mimic existing code style and patterns.