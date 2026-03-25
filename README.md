# pi-extensions

Monorepo for Pi extensions.

## Workspace layout

- `extensions/*` — extension packages
- `scripts/` — development helpers
- `docs/` — design and implementation docs

## Current extensions

- `implement-issue` — global `/implement-issue <issue-number>` workflow extension

## Development

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Run type checks:

```bash
bun run typecheck
```

## Linking an extension into Pi

```bash
./scripts/link-extension.sh implement-issue
pi
/reload
```
