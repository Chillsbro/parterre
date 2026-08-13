<div align="center">

<img src="assets/curtain-reveal.svg" alt="Parterre's curtain-reveal startup: velvet curtains with gold bullion fringe part to reveal the engraved PARTERRE plaque" width="760"/>

</div>

See what your browser agent sees.

Parterre puts a live Playwright browser beside the conversation in your
terminal. Bring Codex, GitHub Copilot, Claude, OpenAI, OpenRouter, Ollama, or
another compatible model. Parterre shows every browser action instead of
asking you to trust a hidden headless session.

## The workspace

<div align="center">
<img src="assets/workspace.svg" alt="Parterre workspace: conversation panel and model picker on the left, live browser pane on the right, status bar below" width="900"/>
</div>

One terminal, the whole session:

- live Chromium, rendered beside the conversation;
- a timed trace of every browser action;
- manual browser workflows turned into tests in your target repo;
- approval-gated README and source-file editing in your workspace;
- approvals before sensitive changes;
- session replay and local codebase profiles.

## Quick start

```sh
curl -fsSL https://raw.githubusercontent.com/Chillsbro/parterre/main/install.sh | sh
parterre setup     # installs the browser and asks which provider to use
parterre run
```

Live browser frames currently require Ghostty or Kitty.

Setup installs only the adapter you choose and reuses its existing
authentication.

## Use your provider

| Provider | Powered by | Requires |
| --- | --- | --- |
| Automatic | Installed adapters | an authenticated Codex, Copilot, or Claude account |
| Codex | Codex SDK | ChatGPT subscription or API key |
| GitHub Copilot | Copilot SDK | Copilot subscription |
| Claude Code | Claude Agent SDK | Claude subscription or API key |
| OpenAI-compatible | Built-in agent loop | OpenAI, OpenRouter, Ollama, or another compatible endpoint |

The base package contains no provider SDKs. `parterre setup` installs the
selected adapter into Parterre—not into your project. Automatic mode checks
installed adapters in preference order and uses the first authenticated one.

Parterre stores no provider credentials or account details. Authentication
stays in the provider's CLI or environment; setup only saves your provider,
endpoint, and model preferences in `~/.parterre/config.json`.

OpenAI-compatible connections need no adapter:

```sh
OPENAI_API_KEY=... parterre run --provider openai
```

OpenRouter and local runtimes are configured by URL:

```sh
OPENAI_API_KEY=... parterre run --provider openai --base-url https://openrouter.ai/api/v1
parterre run --provider openai --base-url http://localhost:11434/v1
```

Set `OPENAI_API_KEY` when the endpoint requires it. Local endpoints usually do
not. Change providers anytime with `parterre setup` or `--provider`.

## Commands

Type `/` and the command menu narrows as you type:

<div align="center">
<img src="assets/command-menu.svg" alt="Animated command menu narrowing as the user types /t, /test, /l, /learn" width="480"/>
</div>

| Command | What happens |
| --- | --- |
| `/test <workflow>` | Proves a browser workflow, writes its automation into the target repo, and runs the repo's test command |
| `/inspect <target>` | Structure, accessibility, console errors, and network activity |
| `/learn [path]` | Learns a codebase's conventions locally; use `refresh` to re-learn |
| `/model [id]` | Switches models mid-conversation. Opens a picker when no id is given; history is preserved |
| `/clear` | Clears the transcript |
| `/quit` | Stops the session and exits |

Sensitive browser actions and every ordinary workspace-file write pause for
approval. Workspace writes open a full-screen diff before anything changes;
press `y` to approve or `n` to deny. Writes can create or replace regular
files, but paths must stay inside `--workspace`; Parterre refuses `.git`,
symbolic links, path escapes, concurrent changes, and files larger than 1 MiB.
Unknown browser commands are rejected; the agent only receives an allowlisted
Playwright interface.
Press `Esc` while the agent is working to interrupt its current turn without
ending the session.

The directory passed with `--workspace` is the target repo. Parterre uses its
existing test convention (`bun test`, `npm test`, `cargo test`, `go test`,
`pytest`, and similar entrypoints) to judge generated automation by exit code.
It will not replace an existing file: during one session, it may only revise a
test file that it created itself.

## Sessions

Every session is persisted in a local SQLite database at
`~/.parterre/sessions/parterre.db`: metadata, the full event log, and learned
codebase profiles. Screenshots, snapshots, traces, recorded videos, and logs
sit next to it on disk. When an agent finishes a video recording, the
transcript includes a clickable `view here` link to the WebM file.

```sh
parterre sessions             # list
parterre resume <session-id>  # continue its transcript and provider conversation
parterre replay <session-id>  # print a session back
parterre delete <session-id>  # remove one
```

Pass repeated `--redact <value>` options to strip known secrets from
persisted events. Resume requires the original values in the same order before
any new redactions; Parterre stores only salted verifiers for this check.
Sessions created before verifiers existed fail closed unless you explicitly
pass `--allow-unverified-redactions` after reviewing their history.

Codex, Copilot, and Claude resume their native provider conversation when its
durable ID is available. OpenAI-compatible endpoints and legacy sessions use a
bounded, completed-turn transcript instead. The original provider, recorded
model, workspace, and endpoint stay pinned. Only one process can own a session
at a time, and unresolved approvals are never replayed.

The browser uses the session's persistent profile. A crashed session reuses a
still-live compatible browser; a cleanly stopped session starts a new browser
at its last safe HTTP(S) URL. Parterre shows a warning before either path
because the profile may restore authenticated website state.

## Feedback and contributing

Found a bug? [Open a bug report](https://github.com/Chillsbro/parterre/issues/new?template=bug_report.yml).

Contributions are welcome—see [CONTRIBUTING.md](CONTRIBUTING.md). Please report
security vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Parterre is available under the [MIT License](LICENSE).

---

Parterre supports macOS and Linux terminals. Windows is not supported at this time.
