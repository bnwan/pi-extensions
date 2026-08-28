# pi-extensions

Monorepo for Pi extensions.

## Workspace layout

- `extensions/*` — extension packages
- `scripts/` — development helpers
- `docs/` — design and implementation docs

## Current extensions

- `implement-issue` — global `/implement-issue <issue-number>` workflow extension
- `epic-next` — tools (`epic_next_picks`, `epic_spawn`, `epic_check`, `epic_teardown`) + `/epic-check` command backing the `epic-next` orchestrator skill: live state sync, parallel-safe pick computation, living-plan-comment patching, visible herdr agent spawns with equal-width pane math, and post-merge teardown

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
