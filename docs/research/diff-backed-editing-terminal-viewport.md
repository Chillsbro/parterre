# Diff-backed editing in Parterre: terminal renderer and dynamic viewport

Researched 2026-08-12 against Parterre's Bun/TypeScript/React 19/Ink 7 stack, OpenTUI 0.5.2, and Hunk 0.18.1. Sources are upstream package repositories, package metadata, framework documentation, and terminal-protocol specifications.

**Implementation scope update:** the cutover targets Kitty graphics only. Ghostty and Kitty are the supported live-frame terminals; iTerm2, Sixel, and text-image fallbacks are intentionally out of scope. The broader comparisons below record the research that informed that decision, not a support commitment.

## Decision

Use **imperative OpenTUI core**, with the gates below as cutover requirements. Use [`@opentui/core` 0.5.2 `DiffRenderable`](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/renderables/Diff.ts) for the embedded viewer and a direct [`diff` (jsdiff) v9](https://github.com/kpdecker/jsdiff/tree/v9.0.0) dependency to generate bounded unified patches from the in-memory before/after source. Do not add `@opentui/react`, React, or React hooks to the new UI.

Keep live browser rendering **out of band**. OpenTUI owns chrome/layout and publishes the measured browser region; the dedicated Kitty `FramePainter` owns PNG transmission and latest-frame coalescing on its separate schedule. Do not drive OpenTUI's render loop with the approximately 10 fps screencast or use `ImageRenderable` for that live path. A workspace review calls `FramePainter.suspend()` to stop placements and clear the current native image, takes the viewport, then restores the measured region and calls `resume()` to paint only the newest cached frame.

The requested combination “embedded Hunk while removing React” is not available in Hunk 0.18.1. Its package exports only `./extension`, `./opentui`, and `./package.json`; `hunkdiff/opentui` is a React TSX barrel, its package peers on `@opentui/react` and `react`, and its highlighting path calls `useLayoutEffect`, `useState`, and `useMemo` ([package metadata](https://github.com/modem-dev/hunk/blob/v0.18.1/package.json), [public barrel](https://github.com/modem-dev/hunk/blob/v0.18.1/src/opentui/index.ts), [diff component](https://github.com/modem-dev/hunk/blob/v0.18.1/src/opentui/HunkDiffBody.tsx), [highlighting hook](https://github.com/modem-dev/hunk/blob/v0.18.1/src/ui/diff/useHighlightedDiff.ts)). It also requires OpenTUI `^0.4.3`, which does not accept 0.5.2. There is no public imperative/core Hunk UI export.

The final direction resolves that conflict in favor of the underlying goal: ship no Hunk, Pierre, React, JSX, or hooks in the TUI. Hunk may remain an optional external reviewer, and it should be reconsidered for embedding only if it later publishes a React-free core renderable compatible with Parterre's pinned OpenTUI version. Forcing Hunk 0.18.1 onto OpenTUI 0.5.2 or downgrading the migration to 0.4.x is not a sound production baseline.

The migration should still begin with the timeboxed slice below. This is no longer a renderer-selection spike; it is the first migration checkpoint, and a failed hard gate blocks release. The fully specified Ink design later in this report remains a contingency, not the selected architecture.

The review surface should temporarily take the main viewport, retain the two-row status bar, and restore the browser's previous layout and frame after approve or deny. Approval typing, ephemeral source delivery, snapshot validation, and persistence boundaries are renderer-independent.

The key product distinction is:

- **Workspace-write approvals** get the full review surface because the user must inspect proposed source before Parterre mutates disk.
- **Browser-action approvals** keep the existing compact approval in the conversation pane because the live browser is itself important approval context.

Do not put a source diff into the current narrow approval box. Parterre reserves only five rows for pending approval, uses roughly 40% of the terminal for the left pane, and gives the rest to the browser ([layout calculation](../../src/app/layout/computeAppLayout.ts#L32-L90), [current composition](../../src/app/App.tsx#L170-L240)). That is enough for a command confirmation, not code review.

## Library findings

| Option | Data and compatibility | Terminal review capability | Fit for Parterre |
| --- | --- | --- | --- |
| [`diff` v9](https://github.com/kpdecker/jsdiff/blob/v9.0.0/package.json) | Dependency-free package with ESM and CommonJS exports and bundled TypeScript declarations. `structuredPatch` yields files, hunks, old/new ranges, and context; the common options include `timeout` and `maxEditLength` ([API](https://github.com/kpdecker/jsdiff/blob/v9.0.0/README.md)). | No renderer, layout, line-number, or theme policy. | **Recommended patch/model library.** Use it directly to generate one bounded patch per proposed file; do not rely on OpenTUI's transitive copy as a public application dependency. |
| [OpenTUI 0.5.2 `DiffRenderable`](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/renderables/Diff.ts) | `@opentui/core` has no React dependency or peer; core already depends on `diff@9` and accepts Bun 1.3+ ([core package](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/package.json)). The documented API constructs `new DiffRenderable(renderer, options)` and adds it to `renderer.root`, with no JSX or hook layer ([component docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/components/diff.mdx)). It consumes unified patch text and currently selects the first parsed file. | Native unified/split code view, Tree-sitter syntax highlighting, line numbers, word/character/no-wrap modes, selection colors, synchronized split scrolling, and hunk row offsets. | **Selected embedded renderer.** A single-file workspace-write approval matches its first-patch constraint. Parterre still owns modal chrome, file navigation, responsive mode choice, approval routing, and persistence safeguards. |
| [`@assistant-ui/react-ink`](https://github.com/assistant-ui/assistant-ui/blob/d8ccd52ccf7250ffc0c814f61e6e96b737585842/packages/react-ink/package.json) | ESM/TypeScript, React 19, and Ink 6+ peer compatibility. Its diff primitive accepts a patch or old/new files. It also brings assistant-ui runtime/store dependencies plus both `diff` and `parse-diff`. | Native Ink unified rows, file header/stats, line numbers, context folding, and custom `renderLine`/`renderFold` hooks ([docs](https://www.assistant-ui.com/docs/ink/primitives#diff), [source](https://github.com/assistant-ui/assistant-ui/blob/d8ccd52ccf7250ffc0c814f61e6e96b737585842/packages/react-ink/src/primitives/diff/DiffContent.tsx)). No split view or horizontal-scroll API; `maxLines` is a prefix cap, not a navigable viewport, and default colors are fixed in the component source. | Closest native-Ink precedent and useful reference/spike, but too constrained for the target viewer and a disproportionate dependency tree for one primitive. Its parsing utilities are internal rather than a small standalone public API. |
| [Hunk `hunkdiff` 0.18.1](https://github.com/modem-dev/hunk/blob/v0.18.1/package.json) | Public UI is React TSX and peers on `@opentui/core ^0.4.3`, `@opentui/react ^0.4.3`, and `react ^19.2.4`. It has no core/imperative UI subpath. | Strong review UI: responsive split/stacked layouts, wrapping, horizontal offset, line numbers, syntax themes, file navigation, selection, and composable single/multi-file components ([component guide](https://github.com/modem-dev/hunk/blob/v0.18.1/docs/opentui-component.md)). | **Not compatible with the React-free goal or OpenTUI 0.5.2.** Keep it out of the embedded migration; reconsider if Hunk adds a core renderable export and a compatible peer range. |
| [`git-split-diffs-api`](https://www.npmjs.com/package/git-split-diffs-api) | Node API fork of a terminal-oriented git diff transformer. | Produces pre-rendered ANSI split diffs with syntax highlighting and wrap/truncate choices. | Not an Ink component or semantic row model. Fixed-width ANSI output makes responsive navigation and windowing Parterre's problem after rendering has already occurred. |
| [`@heyhuynhgiabuu/pi-diff`](https://www.npmjs.com/package/%40heyhuynhgiabuu%2Fpi-diff) | A Pi extension rather than a supported standalone viewer API. | Its Pi UI is a useful precedent: Shiki coloring, line numbers, wrap/truncate controls, and split mode only on wide terminals. | Do not couple Parterre to another host's extension contract. Reuse the responsive idea, not the package. |
| [`@pierre/diffs`](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs) | Its root exports public `parseDiffFromFile`/`parsePatchFiles` utilities and vanilla DOM renderers; `/react` is a separate export. However, the package contract declares React and React DOM peers, has no parser-only subpath, and brings Shiki plus web rendering infrastructure ([package metadata](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/package.json), [root exports](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/src/index.ts)). Hunk 0.18.1 re-exports these parsers from its React-coupled barrel. | Rich split/stacked browser diff, themes, annotations, and virtualization through DOM/CSS/Shadow DOM; it is not a terminal renderer ([documentation](https://diffs.com/docs)). | The parser can produce useful hunk metadata, but the supported package boundary does **not** meet the no-React-dependency goal and duplicates jsdiff/OpenTUI functionality. Do not add it for the terminal approval path. |
| [`@pierre/trees`](https://github.com/pierrecomputer/pierre/tree/main/packages/trees) | A Preact/DOM file-tree package whose metadata also declares React and React DOM peers ([package metadata](https://github.com/pierrecomputer/pierre/blob/main/packages/trees/package.json), [public exports](https://github.com/pierrecomputer/pierre/blob/main/packages/trees/src/index.ts)). | Virtualized file navigation with status, selection, and tree operations for web UIs. | **Not a diff algorithm and not Tree-sitter.** It is unrelated to terminal syntax/structural diffing and should not be part of this feature. |

[`parse-diff`](https://www.npmjs.com/package/parse-diff) is a small typed unified-patch parser, but it is redundant for the core write path: Parterre has both the existing and proposed content and can ask jsdiff for structured hunks directly. It becomes useful only if Parterre later needs to ingest an external patch string.

### React-free embedded options versus terminal subprocesses

There is one clean embedded stack for the chosen constraints: **`diff@9` + imperative `@opentui/core`**. jsdiff creates the patch and enforces comparison budgets; `DiffRenderable` parses and displays it; `ScrollBoxRenderable` and Parterre's controller own viewport/navigation; OpenTUI's `CodeRenderable` uses Tree-sitter for syntax highlighting. This uses established libraries without React, JSX, hooks, DOM, or pre-rendered ANSI.

“Pierre Trees” refers to [`@pierre/trees`](https://trees.software/), a web file-tree widget, not syntax trees. [`@pierre/diffs`](https://diffs.com/) computes ordinary line patches with jsdiff and highlights with Shiki. OpenTUI also computes an ordinary line diff, then uses Tree-sitter to color code. Only Difftastic among the options below performs a structural syntax-tree diff; that is a different semantic product, not merely better syntax highlighting.

| Candidate | React-free and embeddable in imperative OpenTUI? | Exact role and decision |
| --- | --- | --- |
| `diff@9` + `DiffRenderable` | **Yes** | Selected. Both expose typed programmatic APIs; OpenTUI documents direct construction and `renderer.root.add(diff)`. This retains semantic application control and lets one TUI renderer own cells, input, and resize while the dedicated painter remains outside its frame cadence. |
| `@pierre/diffs` | Not under its supported package contract | The root does export parsers usable from vanilla JavaScript, but it also exports web renderers, declares React/React DOM peers, and has no parser-only export. It adds Shiki/DOM-oriented machinery while duplicating jsdiff. Reject for this TUI. |
| `hunkdiff/opentui` 0.18.1 | **No** | The only OpenTUI export is a React component barrel. Even importing a model helper through that barrel traverses static component re-exports, and the package still requires React peers. Reject. |
| `@pierre/trees` | **No** | Preact/DOM file-tree rendering, unrelated to parsing source or rendering terminal diffs. Reject. |

The polished alternatives below are executables or pager filters, not components that can share an OpenTUI render tree:

| Standalone tool | Strengths | Why it is not the embedded approval surface |
| --- | --- | --- |
| [Difftastic](https://github.com/Wilfred/difftastic) | Real Tree-sitter structural comparison, side-by-side and inline output, line numbers, width control, and syntax-aware matching. Its own README notes high memory/time on large changes and that its output is for humans rather than a patch ([README](https://github.com/Wilfred/difftastic#readme), [CLI options](https://difftastic.wilfred.me.uk/rustdoc/src/difft/options.rs.html)). | Distributed as the `difft` Rust binary rather than a Bun/TypeScript renderable ([manifest](https://github.com/Wilfred/difftastic/blob/master/Cargo.toml)). It would own output geometry; one input may come from stdin but the other remains a file path. Useful as an explicit advanced structural-review handoff, not the security decision model. |
| [Delta](https://github.com/dandavison/delta) | Mature syntax-highlighted pager/filter with side-by-side wrapping, line numbers, navigation, themes, and hyperlinks. | Its published interface is the `delta` Rust binary consuming diff text and emitting/paging ANSI ([README](https://github.com/dandavison/delta#features), [manifest](https://github.com/dandavison/delta/blob/main/Cargo.toml)). Captured output has already committed to a width and is not a semantic OpenTUI model. |
| [git-split-diffs](https://github.com/banga/git-split-diffs) | Shiki highlighting, inline-change emphasis, wrap/truncate, themes, and automatic unified fallback below a configurable width (160 columns by default). | Its package publishes only the `git-split-diffs` CLI binary and bundled themes, with no library export ([package metadata](https://github.com/banga/git-split-diffs/blob/main/package.json), [README](https://github.com/banga/git-split-diffs#readme)). It emits fixed-width ANSI to a pager. |
| [Riff](https://github.com/walles/riff) | Lightweight Rust filter for word-level highlighting of changed lines, hyperlinks, conflicts, and merge commits. | Designed to pipe unified diff through `riff` and then a pager; it is not split-view review navigation or an OpenTUI component ([README](https://github.com/walles/riff#readme)). |
| [Ydiff](https://github.com/ymattw/ydiff) | Dependency-free Python tool with side-by-side/unified modes, auto width, wrapping control, themes, and paging. | A Python CLI/pager, not a TypeScript semantic model; shipping it would add an external runtime and terminal handoff ([README](https://github.com/ymattw/ydiff#readme)). |
| Hunk CLI | Strong multi-file review UI. | Still runs its own React/OpenTUI stack and primarily reviews materialized repository changes. It can be an optional user-installed handoff later, but must not become a dependency or require writing an unapproved proposal to disk. |

Subprocess viewers can be useful as a deliberate “open advanced reviewer” action after Parterre suspends its renderer. They should never translate “child exited successfully” into approval. Return to Parterre for the explicit `y`/`n` decision, and pipe a patch when a tool supports stdin so source is not staged or persisted merely for presentation.

## Migrating Parterre from Ink to imperative OpenTUI

**Yes, with a gated cutover.** The chosen architecture is the imperative `@opentui/core` renderable tree, not the `@opentui/react` binding. OpenTUI's current primitives directly address the expensive parts of this feature while also removing React reconciliation and hook effects from the shipped TUI. The migration remains risky because Parterre's live browser image is a primary product surface rather than decoration; the parity slice below must prove those seams before Ink is removed.

The upstream maturity signals point in both directions. OpenTUI says it powers OpenCode in production and uses a native Zig core for correctness and performance ([project README](https://github.com/anomalyco/opentui/tree/v0.5.2)). At the same time, its official roadmap labels versions 0.1 through 0.5 “exploring the problem space,” calls the next 0.x phase a major refactor, places the native renderable tree at 1.0, and defers screen-reader support to the next phase ([roadmap issue](https://github.com/anomalyco/opentui/issues/821)). Version 0.5.2 was the current release when this report was written; pinning is necessary but does not remove migration cost on future upgrades.

| Area | Existing Ink 7 | Migrate to imperative OpenTUI core 0.5.2 | Consequence |
| --- | --- | --- | --- |
| React/Bun fit | Already running on React 19 and Bun. Pure-JS renderer dependencies. | `@opentui/core` declares Bun `>=1.3.0` and has no React dependency or peer. It is a Zig native library with TypeScript bindings and optional prebuilt platform packages ([package metadata](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/package.json)). | Removes React/Ink and their hook lifecycle from the UI. Native loading, install size, and ABI/platform delivery are new failure modes. Consumers use prebuilds; Zig is needed only to modify/build core itself ([development guide](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/docs/development.md)). |
| Diff capability | No suitable complete Ink viewer was found; Parterre would combine jsdiff with a custom semantic viewer. | Built-in imperative `DiffRenderable` provides unified/split, Tree-sitter highlighting, line numbers, wrapping, synchronized scroll, theming, and hunk offsets. It parses only the first file from a supplied patch. | OpenTUI removes much of the renderer work for today's one-file approval. Parterre still owns approval UX, responsive policy, file header/stats, input routing, and failure behavior. |
| Hunk reuse | Cannot embed: Hunk's public components target OpenTUI React. An external subprocess is possible. | Deliberately excluded. Hunk 0.18.1 has no imperative renderable export, calls React hooks, and peers on OpenTUI 0.4.x. | The migration uses OpenTUI's built-in diff. Revisit Hunk only if it publishes a core-only API compatible with the pinned renderer; a React wrapper is not acceptable for this direction. |
| Layout and scrolling | Ink/Yoga plus `ink-scroll-view`; the latter retains and lays out every child. Horizontal scrolling and large-diff windowing are application work. | Native-Yoga-backed layout; `ScrollBox` supports horizontal and vertical scrolling, keyboard paging, scrollbars, and viewport culling ([ScrollBox docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/components/scrollbox.mdx)). `DiffRenderable` stores code in its text/code renderables rather than one React child per line. | OpenTUI has the better primitive set. Viewport culling skips offscreen rendering but is not proof of bounded memory; the roadmap still notes that text-buffer views cache invisible virtual lines. Benchmark the 1 MiB worst case. |
| Input, mouse, and focus | Parterre's React/Ink hooks and custom SGR wheel parser work today. | Core exposes `renderer.keyInput` key/paste events, focusable renderables, hit-grid mouse dispatch, text selection, and focused ScrollBox keyboard navigation without hooks ([core input example](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/components/input.mdx), [renderable input source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/Renderable.ts)). | Potentially delete custom mouse plumbing and effect-driven input registration, but key names, paste behavior, propagation, focus ownership, and Ctrl-C semantics all require parity tests and explicit listener disposal. |
| Screen ownership | Ink currently renders on the main screen; `alternateScreen` is a render-lifecycle option. | Runtime-selectable `alternate-screen`, `main-screen`, and `split-footer` modes, plus `suspend()`/`resume()` ([screen-mode docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/core-concepts/renderer.mdx#screen-modes)). | Start the migration in `main-screen` to preserve behavior. Treat a move to alternate screen as a separate product decision, and verify scrollback/startup/exit restoration. |
| Browser graphics | The former split solution mixed dedicated native painting with `ink-picture` fallbacks. | Keep the live screencast in the dedicated out-of-band Kitty `FramePainter`; OpenTUI only publishes region geometry. Although `ImageRenderable` can own image placement ([image docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/components/image.mdx), [renderer image source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/zig/renderer.zig)), feeding every browser frame through it would couple UI rendering to browser FPS. | Preserve renderer/painter separation. Add explicit painter suspend/delete/resume around modal review. Unsupported terminals receive a clear notice rather than another rendering path. |
| Incremental performance | Proven adequate for the current UI; a custom large diff needs explicit row windowing. | Retained native buffers compare cells, suppress no-op frames, render automatically only after changes, and expose render statistics. Code/diff highlighting uses Tree-sitter. | Likely advantage, not a measured Parterre result. Benchmark transcript growth, resize, and large diffs, and prove the out-of-band browser painter does not increment OpenTUI render cadence. |
| Testing | Existing `ink-testing-library`/`renderToString` tests drive stdin and assert final text frames. | The **core** native in-memory test renderer supplies deterministic keyboard, paste, mouse, resize, terminal capabilities, character frames, styled spans, visual-idle waits, and frame recording; React's `testRender` wrapper is not needed ([testing docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/core-concepts/testing.mdx)). | The target harness is capable and stronger for mouse/capability tests, but migration rewrites the current tests and README asset generator; there is no documented drop-in `renderToString` equivalent. |
| Packaging/platforms | Parterre ships a source/dist archive and the installer runs target-side `bun install`; current release CI is Linux-only. | Core publishes optional prebuilt native packages for Darwin/Linux/Windows, x64/arm64, plus Linux musl. It documents Bun standalone and Node SEA packaging ([standalone docs](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/reference/standalone-executables.mdx)). | Parterre need not compile a binary for each target under its current external-package build, but must validate optional-dependency selection and loading on both supported macOS and Linux ([current release workflow](../../.github/workflows/release.yml#L10-L28)). |
| Accessibility and non-TTY | Ink 7 automatically switches behavior for CI/piped stdout, offers `renderToString`, and has basic screen-reader output with an ARIA subset ([noninteractive mode](https://github.com/vadimdemedes/ink/blob/v7.1.0/readme.md#interactive), [screen readers](https://github.com/vadimdemedes/ink/blob/v7.1.0/readme.md#screen-reader-support)). | OpenTUI documents custom streams and test output, but its roadmap places screen-reader support in future 0.x work. No equivalent accessibility contract is documented today. | A migration otherwise regresses a framework capability. Provide and test a deterministic text-only/non-TTY path, and either preserve usable screen-reader output or explicitly defer migration. |
| Migration surface | No framework rewrite. | A local import scan finds 23 files under `src/` and `tests/` tied directly to Ink or Ink add-ons. Entry/lifecycle, JSX intrinsics, hooks, composer, transcript, browser measurement, graphics, snapshots, and README rendering all change. Runtime, provider, session, workspace, and approval-domain modules can remain. | This is a renderer migration, not a diff-library swap. Keep it isolated from the production feature until parity is demonstrated. |

### Painter separation is the decisive migration gate

Do not put the live CDP screencast in OpenTUI's renderable tree. Parterre acknowledges frames every 100 ms and requests up to 1280×800, while the current `FramePainter` coalesces pending work to the newest frame ([screencast implementation](../../src/runtime/capturing/startScreencast.ts#L16-L19), [frame handling](../../src/runtime/capturing/startScreencast.ts#L81-L99)). Driving an `ImageRenderable` update for every frame would make ordinary UI paint cadence follow browser FPS—the coupling this migration must preserve against.

Keep two explicit owners: OpenTUI owns terminal-cell chrome, input, and layout; `FramePainter` owns live graphics transmission. After each relevant layout/resize, OpenTUI publishes only the measured browser region. The painter maintains newest-frame backpressure, writes through a serialized output boundary, and never invalidates the OpenTUI tree merely because a CDP frame arrived. `ImageRenderable` can still serve static/non-live or low-rate fallback images, but not the live browser.

The out-of-band painter must participate in modal lifecycle. Before the diff subtree replaces the browser, `suspend()` stops placements and deletes/clears the visible native image; while suspended it retains at most the newest frame. After approve/deny, OpenTUI restores and measures the browser region, calls `setRegion(nextRegion)`, then `resume()` paints only that newest frame. The cutover fails if writes interleave with OpenTUI output, if the browser drives TUI FPS, or if Ghostty or Kitty leaves stale pixels.

### First migration slice and cutover gates

Begin on one isolated branch with a timeboxed parity slice. Reuse Parterre's existing runtime and scripted runtime; replace only enough UI/terminal infrastructure to exercise one end-to-end browser session and one workspace-write approval. Use only imperative core renderables, including `DiffRenderable`; do not introduce Hunk, Pierre, `@opentui/react`, React, JSX, or hooks.

The migration is a **go** only when all of these are demonstrated, with automated evidence where possible:

1. Feed the existing approximately 10 fps CDP stream (100 ms acknowledgement, 1280×800 cap) through the dedicated `FramePainter` with latest-frame coalescing/backpressure and stable memory. Prove from render statistics that browser FPS does not cause OpenTUI tree renders.
2. In Ghostty and Kitty, `FramePainter.suspend()` removes the native image completely before the full-width modal diff paints; `setRegion()` plus `resume()` restores only the newest frame in the newly measured region after approve/deny and resize. No stale placement or review-text bleed is acceptable.
3. Unsupported terminals show an explicit live-frame requirement and do not initialize a second image-rendering implementation.
4. Preserve composer typing and bracketed paste, transcript scrolling and hyperlinks, model picker, browser-action and workspace approvals, wheel/mouse selection, focus routing, Ctrl-C semantics, startup animation, browser-focus mode, and clean terminal restoration on every exit path.
5. Port the existing deterministic UI tests to OpenTUI core's native test renderer, including keyboard, mouse, resize, terminal-capability, graphics-lifecycle, and short-terminal cases. Replace `renderToString`-based README asset generation with reproducible captured frames. Add a non-TTY/no-control-sequence test and a usable screen-reader/text-mode decision.
6. Prove `bun install`, typecheck, tests, build, installer/updater, and a launched TUI on both supported macOS and Linux architectures. Confirm the release archive's target-side install selects the correct optional native package and that update verification remains unchanged.
7. Exercise the maximum workspace-file size and high-edit-distance patches in unified and split views. Scrolling, resize, wrap toggles, and hunk navigation must remain responsive and bounded enough for the existing 1 MiB policy.
8. Prove the approval presentation remains ephemeral: old/new source never enters SQLite, transcript events, logs, renderer console captures, or crash output.

Ship the OpenTUI cutover only after every hard gate passes. A failure pauses the migration for a fix or an explicit support-policy decision; it does not justify silently weakening image, platform, persistence, input, accessibility, or terminal-restoration behavior. The Ink design below remains a recoverable contingency if the migration is abandoned. Revisit Hunk only after it has a React-free imperative export compatible with Parterre's pinned OpenTUI version.

### Ink contingency: why custom rendering would not reinvent the diff

The application-specific part is presentation, not Myers-style comparison or patch parsing. `diff@9` should own semantic comparison and hunk construction. Parterre's renderer should convert each hunk into a small display-row model containing file/hunk identity, old and new line numbers, row kind, text, and continuation metadata.

That separation is important because Ink is not just an ANSI string host. Ink itself uses ANSI-aware wrapping/truncation and terminal-cell measurement—`wrap-ansi`, `cli-truncate`, `slice-ansi`, and `string-width` appear in its rendering path ([wrapping source](https://github.com/vadimdemedes/ink/blob/25766aec618bd62030069f57dd081e5ebdd46add/src/wrap-text.ts), [output source](https://github.com/vadimdemedes/ink/blob/25766aec618bd62030069f57dd081e5ebdd46add/src/output.ts)). Therefore SGR-colored text is not automatically measured incorrectly. The problem with a pre-rendered ANSI diff is higher-level: it has already chosen widths, gutters, wrapping, and line grouping, so Ink cannot reliably reflow it, navigate semantic hunks, theme individual fields, or render only a windowed slice.

## Recommended approval experience

Use an explicit app mode such as `normal | workspaceReview`; do not overload `browserFocused`. The review is modal at the input-routing level and ephemeral at the persistence level.

```text
Before: normal workspace
┌ conversation / controls 40% ┐┌ browser 60% ────────────┐
│ transcript                   ││ live page               │
│ composer                     ││                         │
└──────────────────────────────┴─────────────────────────┘
└ status: running ───────────────────────────────────────┘

During: workspace-write review
┌ Replace src/foo.ts  +12 -4  file 1/1  hunk 2/3 ───────┐
│  18  18   unchanged                                      │
│  19   - - removed                                        ▐
│   -  19 + added                                          ▐
│                        native diff viewport               ▐
├ ↑↓/Pg scroll  [/ ] hunk  w wrap  v unified/split ──────┤
│ Y approve   N deny                                       │
└ status: reviewing workspace write ──────────────────────┘

After: normal workspace restored
┌ conversation / controls 40% ┐┌ browser 60% ────────────┐
│ transcript                   ││ latest frame repainted  │
│ composer                     ││                         │
└──────────────────────────────┴─────────────────────────┘
└ status: running ───────────────────────────────────────┘
```

### State and data flow

1. The workspace editor already reads the target to snapshot it before waiting and verifies that snapshot again before committing ([workspace editor](../../src/workspace/createWorkspaceEditor.ts#L88-L148)). Retain those inspected bytes long enough to compute a bounded `DiffReviewPatch` from the existing and proposed content before requesting approval; do not perform an unrelated second read.
2. Give approvals a typed purpose, for example `kind: "workspace_write" | "browser_action"`, rather than recognizing a workspace write from human-readable command text.
3. Persist only safe audit metadata in the existing `approval_requested` session event: request ID, approval kind, relative path, create/replace action, byte count, line statistics, and optionally hashes. Do **not** add complete before/after source to that event. The current `publish` path appends a session event before notifying the UI ([runtime context](../../src/runtime/creating/createRuntimeContext.ts#L28-L39)), so source attached there would be stored in SQLite and replayed.
4. Add a separate, ephemeral approval-presentation notification keyed by approval request ID. It carries the in-memory review patch directly to the current UI and is neither a `SessionEvent` nor accepted by session storage. Clear it on approve, deny, cancellation, runtime stop, or proposal failure.
5. When a workspace review arrives, save the previous `browserFocused` value, call `FramePainter.suspend()` and await/confirm visible-image cleanup, then add `WorkspaceDiffReview` across the main layout height. Keep the existing two-row status bar.
6. Route the decision through the existing approval gate. After resolution, clear review state, restore the browser region, publish its new measurement to the painter, then call `resume()` to paint only the cached newest frame. Restore the prior focus mode rather than always returning to 40/60.

The review should be available only while an unresolved approval owns the matching request ID. A stale presentation must never approve a newer request.

### Input and focus

Register one long-lived controller on OpenTUI core's `renderer.keyInput` `keypress` and `paste` events, and dispose those listeners with the renderer. Focusable renderables subscribe internally only while focused, and mouse callbacks attach to renderables, so the controller can make `workspaceReview` a true input mode without React effects ([key handler source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/lib/KeyHandler.ts), [renderable focus/input source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/Renderable.ts)). Explicit app-mode routing remains simpler and safer than relying on focus alone:

- The root handler checks `workspaceReview` first.
- Composer, transcript paging, browser-focus toggles, and browser keyboard forwarding are inactive during review.
- `Ctrl+C` retains its current global shutdown behavior.
- Up/Down or `j`/`k`: one display row.
- Page Up/Page Down: `viewportHeight - 1` rows.
- Home/End: start/end; `[`/`]`: previous/next hunk; optionally `{`/`}` for files.
- Left/Right or `h`/`l`: horizontal offset when wrapping is off.
- `w`: wrap toggle. `v`: unified/split toggle where split is viable.
- `y`: approve. `n` or Escape: deny. Show the exact decision keys persistently.
- Mouse wheel events go to the review offset while the mode is active instead of the transcript.

This replaces the current global Page Up/Page Down logic and approval `y`/`n` hook routing ([App input routing](../../src/app/App.tsx#L102-L140)) and ensures only one controller acts on a keystroke.

## Responsive viewport policy

OpenTUI's renderer emits `resize(width, height)`, and imperative renderables expose computed layout geometry. Recalculate the outer mode from the renderer dimensions, update the review container and `DiffRenderable.view`, and clamp the scroll position after layout ([layout resize example](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/core-concepts/layout.mdx#responsive-layouts)).

Recommended rules:

- Use **unified** mode below about 150 columns. Enable **split** by default at 150+ columns only when each side still has a useful code width after line-number and change-marker gutters. The threshold is a starting heuristic, not a promise; base the final condition on measured columns.
- Unified mode may hard-wrap by default. Continuation rows repeat neither old/new line number and use a subtle continuation gutter.
- Split mode should truncate with horizontal scrolling by default, keeping old and new sides at the same horizontal offset. Wrapping independently destroys row alignment. The `w` toggle can opt into wrapping and may force unified mode.
- Use Parterre theme tokens for additions, deletions, hunk headers, gutters, focus, and muted context. Do not bake raw red/green SGR sequences into the model. Syntax highlighting can be layered on later without changing the review model.
- When resize changes unified/split mode or wrapping, anchor the viewport to `(file, hunk, source line)` rather than a raw flattened-row offset.
- Under very short terminals, collapse secondary help and statistics before the diff body. Preserve the status bar, the decision row, and at least four review rows. This follows the existing layout's principle of explicitly budgeting all visible rows.

Set `DiffRenderable.wrapMode` to `"word"`, `"char"`, or `"none"` and place it in a bidirectional `ScrollBoxRenderable` when horizontal navigation is needed. In split mode use `syncScroll` so both code sides retain alignment. Keep the responsive threshold in Parterre's controller rather than encoding it into the diff model.

### Large diffs must remain bounded

OpenTUI's `ScrollBoxRenderable` supports horizontal/vertical scrolling and viewport culling, while `DiffRenderable` keeps source in native-backed code/text buffers instead of creating one JavaScript component per line ([ScrollBox source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/renderables/ScrollBox.ts), [Diff source](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/core/src/renderables/Diff.ts)). Culling reduces offscreen paint work; it does not prove bounded parsing, highlighting, or retained memory.

For the review body:

1. Generate one bounded unified patch per file and show only the selected file in the current `DiffRenderable`, because OpenTUI 0.5.2 reads only the first parsed patch.
2. Put a time/edit budget on jsdiff through `timeout` and/or `maxEditLength`. If comparison aborts, show a clear non-approvable state or require an explicit external/full-file review path. Never silently fall back to a blind `y` approval.
3. Default to three context lines. Keep full proposed content only in the ephemeral approval object; patch context is presentation, not mutation semantics.
4. Use `ScrollBoxRenderable` viewport culling and native scrollbars; do not recreate the old `ink-scroll-view` pattern or one renderable per source line.
5. Benchmark parsing, Tree-sitter highlighting, resize, scroll, and retained memory at the existing 1 MiB limit. If the built-in diff is not responsive enough, add a bounded core renderable/model rather than switching to pre-rendered ANSI.

The existing workspace cap limits each proposed file to 1 MiB ([workspace types](../../src/workspace/types.ts)), but line count and edit distance can still be large; byte caps alone are not a rendering budget.

## Browser image lifecycle is a correctness requirement

Changing only the renderable layout is insufficient for Kitty graphics. Removing the browser region must delete the native placement because text erasure alone does not remove it.

Kitty specifies that erasing text does not erase graphics and provides a dedicated delete action. Lowercase delete selectors remove placements while retaining image data; supplying both image and placement IDs targets the current placement. Reusing the same image/placement identity later replaces or moves it without flicker ([Kitty graphics protocol: deleting images](https://sw.kovidgoyal.net/kitty/graphics-protocol/#deleting-images), [placements](https://sw.kovidgoyal.net/kitty/graphics-protocol/#image-placements)).

Retain `FramePainter` as the Kitty placement owner and add an explicit `suspend()`/`resume()` lifecycle. `suspend()` must send `a=d,d=i,i=<activeImageId>,p=1,q=2` (soft-delete placement 1, retain transmitted image data), stop further placements, and continue coalescing to at most the newest pending frame. `resume()` must wait for the new region measurement and re-place only the cached latest image. Keep uppercase hard deletion for final stop and obsolete frame IDs.

The painter and OpenTUI must share a serialized stdout/terminal-write boundary so frame bytes cannot interleave with cell updates. Region publication should be one-way—from committed OpenTUI geometry to the painter—and a frame arrival must not schedule a TUI render. This preserves the current performance isolation while fixing modal cleanup.

iTerm2, Sixel, and text-image transports are not part of this cutover. Adding one later should be a separate product decision with its own painter implementation and modal-lifecycle tests.

## Full-screen and subprocess choices

OpenTUI supports `main-screen`, `alternate-screen`, and `split-footer` modes, but switching the whole application to alternate screen merely for an approval would alter scrollback and lifecycle behavior ([renderer screen modes](https://github.com/anomalyco/opentui/blob/v0.5.2/packages/web/src/content/docs/core-concepts/renderer.mdx#screen-modes)). Keep Parterre in its selected application screen mode and replace the main renderable subtree with the full-width review surface. Runtime/browser state stays alive while the out-of-band painter is suspended.

OpenTUI's renderer `suspend()`/`resume()` lifecycle can hand terminal ownership to an explicit advanced-review subprocess and redraw afterward. This is not the default approval surface: the user would leave Parterre, browser state would be invisible, and subprocess exit must never be translated directly into approval. Parterre should return to its own full-width decision surface for `y`/`n`.

## Option decision

| Choice | Decision | Reason |
| --- | --- | --- |
| **A. Native Ink full-width review surface** | **Contingency only** | It is fully feasible with jsdiff and windowed rows, but would preserve the React/Ink architecture the project has chosen to leave. |
| **B. Embed Hunk/OpenTUI inside Parterre** | **Reject** | Hunk's public embedded UI requires React hooks and OpenTUI 0.4.x. There is no imperative core export in 0.18.1, and forcing its peer range would create an unsupported renderer mix. |
| **C. Launch Hunk as a subprocess** | **Optional later** | OpenTUI can suspend terminal ownership. Useful as an explicit advanced action only after defining ephemeral patch transfer and cleanup; return to Parterre for the actual approval decision. |
| **D. Show the diff in the current narrow left pane** | **Reject** | Approximately 30–52 columns and five approval rows cannot provide useful code context, line numbers, and navigation. The browser consumes space that is not needed while reviewing a workspace write. |
| **E. Imperative OpenTUI core full-width review** | **Adopt** | `diff@9` generates bounded patches; `DiffRenderable` and `ScrollBoxRenderable` provide the terminal viewer. OpenTUI owns cells/geometry/input while the separately scheduled `FramePainter` owns live browser pixels. |

## Implementation seams

1. Establish an imperative OpenTUI application/controller shell and port one end-to-end scripted session through the cutover gates. Keep runtime, provider, session, workspace, and approval-domain modules renderer-independent.
2. Add direct `diff@9` and a pure `buildDiffReviewPatch(before, after, path, options)` module. Unit-test create, replace, CRLF, Unicode, no-final-newline markers, adjacent changes, `timeout`, `maxEditLength`, and context limits.
3. Introduce typed approval purpose plus the non-persisted `approvalPresentation` notification. Add a persistence regression test proving source content never reaches stored session events.
4. Build an imperative `WorkspaceDiffReview` controller from `DiffRenderable`, `ScrollBoxRenderable`, headers/help/status renderables, and one scoped key/mouse listener set. Start unified, add wide-terminal split mode, and retain a stable file/hunk anchor across resize.
5. Add the explicit review branch to the OpenTUI layout tree. Test wide, narrow, and short terminal matrices, including resize while scrolled and while a decision is pending.
6. Preserve the dedicated Kitty `FramePainter` and latest-frame coalescing. Make OpenTUI publish committed region geometry only; add painter `suspend()`/delete/`setRegion()`/`resume()`. Verify UI render cadence stays independent of browser FPS and cached re-placement works under review, resize, cancellation, and shutdown.
7. Keep browser-action approval behavior compact and unchanged in product terms. Verify that only workspace writes take over the main viewport and that approve, deny, Escape, cancellation, runtime failure, and shutdown all restore or clean up deterministically.

## Acceptance criteria

- The complete target path, create/replace action, line statistics, old/new line numbers, and all changed lines are inspectable before approval.
- Narrow terminals use unified mode; sufficiently wide terminals can use split mode without squeezing either code column below a useful width.
- Very large diffs do not create one JavaScript renderable per file line; scrolling stays responsive, and parsing/highlighting memory remains within the measured budget.
- Browser frame arrival and transmission do not schedule OpenTUI tree renders; UI responsiveness remains independent of screencast FPS.
- No before/after file content is written to SQLite, transcript history, or logs solely to render the approval.
- Workspace review captures input exclusively, while browser approvals retain live browser context.
- A Kitty browser frame is absent throughout review and is re-placed in the correct measured region afterward; stale placements are not left behind.
- Approve/deny returns to the exact prior normal/browser-focused layout, including after terminal resize.
