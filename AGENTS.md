# Agent Project Guidance

This project is a small static website for Marjo Seki with Finnish content and a Japanese-inspired visual direction.

## Agent operating procedure
- Default to using the local Ollama fleet for normal project work when the task has independent investigation, implementation, debugging, review, or verification paths.
- Treat the main assistant as the inspector/supervisor: coordinate agents, compare their findings, inspect diffs, and personally verify tests or commands before reporting completion.
- Use direct local work without the fleet only for tiny one-command tasks, urgent simple edits, or when Leo explicitly makes an exception.
- Apply this norm for both Codex-style and Claude-style agents working in this project.

## Implementation notes
- Keep the site lightweight and static.
- Prefer small, polished CSS updates over heavy redesigns.
- Preserve the existing structure in HTML and JSON-driven content.
