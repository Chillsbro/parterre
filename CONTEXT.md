# Domain glossary

Terms that name parterre's seams. Use these words in code, commits, and reviews.

**Session event** — the canonical record of everything that happened in a session: user messages, agent messages, browser commands, approvals, errors. Persisted to SQLite; the single source both the live TUI and replay interpret. Defined in `src/sessions/types/Session.ts`.

**Transcript** — the interpretation of a session's events as a conversation: one fold from events to timeline items, owned by `src/transcript/`. The OpenTUI transcript view and the replay printer are its two adapters; replay shows exactly what the user saw.

**Timeline item** — one rendered row of the transcript: a user message, a coalesced agent message, a tool result, or an error.

**Command table** — the single definition of every slash command in `src/commands/slashCommands.ts`: matching, help text, and (via the typed handler registry in `src/app/sending`) local behaviour all derive from it. A local command is handled in the TUI; a prompt command expands to an agent prompt.

**Browser command** — one agent-initiated Playwright CLI action and its full lifecycle: policy, approval, auto-open, execution, frame capture, screencast bookkeeping, and event publishing. Owned end to end by `src/runtime/browser/` behind `run(request)`; every command's traits (tier, visual change, tab effects, open/close semantics) live in the descriptor table in `src/playwright/commands/`.

**Target repository** — the workspace selected by `--workspace`: the codebase whose browser workflow is under test and where generated automation belongs. `src/target/` owns test-shaped path validation, new-file materialization, conventional test-command discovery, execution, and exit-code verdict behind `materializeTest()`. It never replaces a pre-existing file and may revise only files it created during the current session.

**Workspace editor** — the approval-gated module in `src/workspace/` that creates or atomically replaces ordinary files inside the selected workspace. Its `writeFile()` interface owns path containment, `.git` and symlink refusal, size limits, concurrent-change detection, and temporary-file cleanup. The runtime exposes it to every provider through `write_workspace_file`; successful writes become session events and filesystem links.

**Workspace review** — the ephemeral, full-viewport diff shown before a workspace write. The runtime may notify the TUI with in-memory before/after source, but that source is never a session event and is never persisted. The OpenTUI adapter builds a bounded unified patch, suspends the browser painter, owns input until approve or deny, then restores the browser viewport.

**Executor** — the adapter that turns a Playwright request into a raw result at the browser-command module's internal seam: the real `playwright-cli` subprocess in production, an in-memory fake in tests.

**Approval gate** — the module that owns a sensitive command's approval from request to resolution (`src/runtime/approvals/`): it publishes the approval events and settles the promise it created. The TUI answers approvals through the runtime controller; shutdown abandons them as denials.

**Ordered publish** — the runtime's single event channel: every session event is appended and notified in submission order; awaiting `publish` means "persisted through mine." There is no unordered variant.

**Frame painter** — the Kitty-graphics module that puts live PNG browser frames on screen in Ghostty and Kitty (`src/terminal/painting/`). It owns absolute placement, contain-fitting, latest-frame coalescing, repainting, and suspend/resume around workspace review. Browser frame arrival never enters OpenTUI state or schedules an OpenTUI render; the UI publishes committed viewport geometry while the painter writes independently. Unsupported terminals show a text notice instead of a graphics fallback.

**Agent provider** — an adapter satisfying the `AgentHandle` interface (`src/runtime/providers/`): sending, current-turn interruption, model selection, and cleanup hide everything agent-specific. Automatic resolution tries installed, authenticated adapters; explicit selection remains available. The GitHub Copilot and Claude Agent SDKs are optional peers, while parterre's own loop over any OpenAI-compatible endpoint owns its history, streaming, and tool dispatch with zero SDK dependencies.

**Release updater** — the launch-time boundary in `src/updating/`: only installer-managed releases carry the `VERSION` and bin-directory metadata that enable it. Before any operational command starts, it checks GitHub's latest stable release, automatically verifies and applies a newer release, and restarts the original command. The archive must match GitHub's SHA-256 asset digest before it reaches the already-installed installer. The installer preflights disk space, stages and smoke-tests on the install filesystem, atomically exchanges installation directories on Linux and macOS, smoke-tests the applied release, and atomically rolls back on apply failure. The local-only `-v` and `--v` version flags exit before this network check. Development builds, non-interactive launches, missing or invalid digests, and failed checks continue without self-modification.
