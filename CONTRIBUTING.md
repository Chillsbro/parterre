# Contributing to Parterre

Thanks for helping make Parterre better.

For bug fixes and small improvements, open a pull request directly. For larger
features or architectural changes, open an issue first so we can agree on the
problem and direction before substantial work begins.

## Development

Parterre requires [Bun](https://bun.com/).

```sh
git clone https://github.com/Chillsbro/parterre.git
cd parterre
bun install --frozen-lockfile
bun run build
```

Run Parterre from source with:

```sh
bun run dev
```

Before submitting a pull request, run:

```sh
bun run lint
bun run typecheck
bun test tests/unit tests/tui
bun run build
```

Browser integration tests additionally require:

```sh
bunx playwright-cli install-browser
bun test tests/integration --timeout 60000
```

## Pull requests

- Keep each pull request focused on one problem.
- Add or update tests when behavior changes.
- Explain what changed and how you verified it.
- Never commit credentials, personal data, or unredacted session artifacts.
- Follow the domain terminology and ownership boundaries in `CONTEXT.md`.

By contributing, you agree that your contribution is licensed under the MIT
License.
