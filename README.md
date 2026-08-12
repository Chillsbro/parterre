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
- approvals before sensitive changes;
- session replay and local codebase profiles.

## Quick start

```sh
curl -fsSL https://raw.githubusercontent.com/Chillsbro/parterre/main/install.sh | sh
parterre setup     # installs the browser and asks which provider to use
parterre run
```

The installer puts Parterre in `~/.local/share/parterre` and links the command
into `~/.local/bin`. It installs Bun first when needed. Set
`PARTERRE_INSTALL_DIR` or `PARTERRE_BIN_DIR` to choose different locations.
Installer-managed releases check GitHub when launched from an interactive
terminal. When a newer stable release exists, Parterre asks before updating
and then resumes the original command. Before installation, Parterre verifies
the release archive against its GitHub-provided SHA-256 digest and passes the
verified local file to the installer already on disk; it never executes an
installer fetched from a mutable tag. Offline checks never block startup.
Run `parterre -v` or `parterre --v` to print the installed release without an
update check.

Setup installs only the adapter you choose. If you are already signed in, it
confirms that immediately:

```text
Found authenticated Codex.

Run `parterre run` to start a session.
```

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
| `/test <workflow>` | Runs a browser workflow and reports failures and final state |
| `/inspect <target>` | Structure, accessibility, console errors, and network activity |
| `/learn [path]` | Learns a codebase's conventions locally; use `refresh` to re-learn |
| `/model [id]` | Switches models mid-conversation. Opens a picker when no id is given; history is preserved |
| `/clear` | Clears the transcript |
| `/quit` | Stops the session and exits |

Sensitive browser actions pause for approval. Unknown commands are rejected;
the agent only receives an allowlisted Playwright interface.
Press `Esc` while the agent is working to interrupt its current turn without
ending the session.

## Render quality

| Terminal | Protocol | Result |
| --- | --- | --- |
| Ghostty, Kitty | Kitty graphics | Pixel-perfect |
| iTerm2, WezTerm, Warp | iTerm2 inline images | Pixel-perfect |
| Sixel-capable (incl. VS Code with images enabled) | Sixel | Sharp |
| Everything else | Unicode half-block mosaic | Impressionist |


## Sessions

Every session is persisted in a local SQLite database at
`~/.parterre/sessions/parterre.db`: metadata, the full event log, and learned
codebase profiles. Screenshots, snapshots, traces, recorded videos, and logs
sit next to it on disk. When an agent finishes a video recording, the
transcript includes a clickable `view here` link to the WebM file.

```sh
parterre sessions             # list
parterre replay <session-id>  # print a session back
parterre delete <session-id>  # remove one
```

Pass repeated `--redact <value>` options to strip known secrets from
persisted events.

## How it fits together

```text
Parterre
  |
  +-- setup and provider discovery
  |     |
  |     +-- install only the selected optional adapter
  |     +-- ask installed adapters for authenticated: yes / no
  |     +-- save provider, model, and endpoint preferences
  |         (credentials and account details stay with the provider)
  |
  +-- agent provider seam (automatic discovery or explicit selection)
  |     |
  |     +-- optional Codex SDK adapter
  |     +-- optional GitHub Copilot SDK adapter
  |     +-- optional Claude Agent SDK adapter
  |     +-- built-in agent loop -> any OpenAI-compatible endpoint
  |
  +-- browser command runner (the playwright_cli tool)
  |     |
  |     +-- descriptor table: one row per command, allow -> approval -> deny
  |     +-- executor -> playwright-cli -> isolated headless Chromium
  |     +-- frame capture after every visual action
  |     +-- CDP screencast -> frame painter drawing protocol-native
  |         frames into the viewport, outside the UI render loop
  |
  +-- session event log (SQLite, ordered)
        |
        +-- transcript fold -> live TUI transcript and `parterre replay`
```

The provider talks to a narrow set of Parterre tools. Browser commands cross
the allowlist and approval gate, run in isolated Chromium, and enter the local
session log. The live screencast is painted with your terminal's native image
protocol. Detailed seams are documented in `CONTEXT.md`.

## Feedback and contributing

Found a bug? [Open a bug report](https://github.com/Chillsbro/parterre/issues/new?template=bug_report.yml).

Contributions are welcome—see [CONTRIBUTING.md](CONTRIBUTING.md). Please report
security vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Parterre is available under the [MIT License](LICENSE).

---

Parterre supports macOS and Linux terminals. Windows is not supported at this time.
