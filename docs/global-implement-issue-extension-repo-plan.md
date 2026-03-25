# Global `implement-issue` Extension Monorepo Plan

## Goal

Create a standalone monorepo for Pi extensions, with `implement-issue` as the first extension package. The repo should be version-controlled, testable, and structured so multiple global Pi extensions can live side by side while sharing tooling and development scripts.

## Repository Purpose

This repository will own:

- a monorepo workspace for Pi extensions
- shared development tooling and scripts
- per-extension runtime code and tests
- documentation for installation, usage, limitations, and release workflow

This repository will not depend on project-specific rules. Extensions should work across repositories by discovering repo context dynamically.

## Proposed Repository Name

- `pi-extensions`

## Proposed Repository Structure

```text
pi-extensions/
├── extensions/
│   └── implement-issue/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── index.ts
│       │   ├── args.ts
│       │   ├── types.ts
│       │   ├── slug.ts
│       │   ├── github.ts
│       │   ├── git.ts
│       │   ├── install.ts
│       │   └── prompt.ts
│       └── test/
│           ├── args.test.ts
│           ├── slug.test.ts
│           ├── git.test.ts
│           ├── install.test.ts
│           └── prompt.test.ts
├── scripts/
│   ├── link-extension.sh
│   └── unlink-extension.sh
├── docs/
│   └── global-implement-issue-extension-repo-plan.md
├── package.json
├── tsconfig.base.json
├── README.md
└── .gitignore
```

## Monorepo Principles

- **Extensions-first layout**: each extension gets its own package under `extensions/`
- **Shared root tooling**: TypeScript, test tooling, and helper scripts live at the repo root where possible
- **Package autonomy**: each extension package should be runnable and testable on its own
- **Global-install friendly**: packages should be easy to symlink into `~/.pi/agent/extensions/` during development
- **Pi package friendly**: packages should be publishable later if needed

## Functional Scope for V1

### In scope

- Monorepo bootstrap for multiple Pi extensions
- First extension package: `implement-issue`
- Global Pi extension command: `/implement-issue <issue-number>`
- Flags:
  - `--yes`
  - `--resume`
  - `--no-worktree`
  - `--no-install`
  - `--plan-only`
- Argument parsing and validation
- GitHub issue lookup using `gh`
- Git repository discovery using `git`
- Generic branch/worktree naming derived from repo name and issue title
- Existing worktree detection and reuse
- Optional worktree creation
- Optional dependency installation based on detected lockfile
- Dedicated Pi session handoff
- Structured prompt generation that instructs the agent to load and follow the `implementer` skill
- Unit tests for pure helper logic
- Root scripts for linking any extension package into Pi’s global extension directory

### Out of scope

- Review-comment automation (`/address-comments`)
- Approval/merge automation (`/approve`)
- Automatic PR creation inside the extension
- GitHub issue commenting automation
- Full issue picker UI for browsing all open issues
- Launching a separate terminal process automatically
- Publishing to npm in V1

## Architecture

### Root workspace

Responsibilities:
- define workspaces for `extensions/*`
- provide shared scripts for test and typecheck orchestration
- document development workflow for all extensions
- host reusable shell scripts for symlinking extension packages into Pi

### `extensions/implement-issue`

Responsibilities:
- register the `/implement-issue` command
- own all runtime logic for issue implementation handoff
- own tests for helper logic and command prompt generation

## `implement-issue` Module Responsibilities

### `src/index.ts`

Responsibilities:
- register the `/implement-issue` command
- prompt for missing issue number when necessary
- validate environment prerequisites
- orchestrate repo discovery, issue lookup, worktree creation/reuse, session handoff, and prompt injection

### `src/args.ts`

Responsibilities:
- parse slash-command arguments into a typed options object
- validate unknown flags and malformed issue numbers

### `src/types.ts`

Responsibilities:
- shared extension types
- normalized issue/repo/worktree/session option types

### `src/slug.ts`

Responsibilities:
- convert issue titles into stable, lowercase, hyphenated slugs
- clamp or normalize unsafe path and branch characters

### `src/github.ts`

Responsibilities:
- wrap `gh issue view`
- normalize GitHub issue JSON into internal types
- isolate GitHub CLI payload assumptions

### `src/git.ts`

Responsibilities:
- detect repo root and repo name
- inspect current branch and worktree state
- parse `git worktree list --porcelain`
- detect matching issue worktrees
- create new issue worktrees when requested

### `src/install.ts`

Responsibilities:
- detect project package manager from lockfiles
- choose install command when appropriate
- skip install for non-JS repos or when `--no-install` is set

### `src/prompt.ts`

Responsibilities:
- build a structured prompt that tells the agent to load the `implementer` skill
- include issue metadata, repo context, branch name, worktree path, and workflow requirements
- support `--plan-only`

## Branch and Worktree Naming Strategy

Derive names dynamically from the repository root name and issue title.

### Branch name

Preferred format:

```text
<repo-name>/issue-<number>-<slug>
```

Fallback if needed:

```text
issue-<number>-<slug>
```

### Worktree path

```text
../<repo-name>-issue-<number>-<slug>
```

## Session Strategy

The extension will create or switch to a dedicated Pi session for issue work.

### Desired flow

1. wait for the current agent to become idle
2. create a new session
3. set a descriptive session name, such as `issue-123: fix-search-ranking`
4. inject a structured setup message if useful
5. send the prepared implementation prompt as a user message

### Known limitation to document

Pi session creation does not automatically guarantee that the runtime cwd moves to the issue worktree. V1 must therefore include the target worktree path explicitly in the prepared prompt and tell the agent to treat that location as authoritative.

## Testing Plan

Use TDD for all pure helper modules before wiring the command orchestration.

### Unit tests

- `test/args.test.ts`
  - parses issue numbers
  - handles flags in mixed order
  - rejects invalid numbers and unknown flags
- `test/slug.test.ts`
  - lowercases, strips punctuation, collapses repeated hyphens
- `test/git.test.ts`
  - parses `git worktree list --porcelain`
  - detects matching worktrees for an issue
- `test/install.test.ts`
  - detects install command from lockfiles
  - skips install when no supported lockfile exists
- `test/prompt.test.ts`
  - includes required issue and repo context
  - changes behavior for `--plan-only`

### Manual verification

- `/implement-issue` prompts for issue number
- `/implement-issue 123` validates and proposes worktree creation
- `/implement-issue 123 --resume` reuses an existing worktree
- `/implement-issue 123 --plan-only` creates the session and stops at planning guidance
- `/reload` picks up extension changes after linking

## Development Workflow

### Local development

1. clone the monorepo
2. install dependencies at the root
3. link a package into Pi’s global extensions directory:
   ```bash
   ./scripts/link-extension.sh implement-issue
   ```
4. start Pi and run `/reload`
5. test `/implement-issue <issue-number>` interactively

### Version control workflow

- use feature branches in the monorepo
- run tests locally before merging
- document behavior changes in `README.md`
- tag releases once packages are stable

## Risks and Mitigations

- **Pi cwd may not follow session handoff** — include authoritative worktree path in the generated prompt and document limitation clearly
- **GitHub CLI output may drift** — isolate normalization logic in `github.ts` and cover it with tests
- **Multiple issue-related worktrees may exist** — add clear selection and reuse rules and prompt the user when ambiguous
- **Non-JS repos may not have an install step** — make install detection optional and safe to skip
- **Monorepo drift between packages** — keep shared tooling centralized and package boundaries explicit
- **Extension reload may be required after edits** — document `/reload` in README and scripts

## Milestones

### Milestone 1 — Monorepo bootstrap
- initialize repository structure
- add Bun + TypeScript + Vitest workspace tooling
- add root README with monorepo and linking instructions
- scaffold `extensions/implement-issue`

### Milestone 2 — Core pure helpers
- implement TDD for `args.ts`, `slug.ts`, `git.ts`, `install.ts`, and `prompt.ts`
- keep orchestration unimplemented or minimal until helpers are stable

### Milestone 3 — Command orchestration
- register `/implement-issue`
- wire environment validation, issue lookup, worktree reuse and creation, and session handoff

### Milestone 4 — Manual integration verification
- verify linking into `~/.pi/agent/extensions/implement-issue`
- verify `/reload`
- verify command behavior in at least one real repo

### Milestone 5 — Documentation hardening
- finalize README examples
- document limitations and troubleshooting
- prepare for first tagged release

## Acceptance Criteria

The monorepo plan is successful when it enables implementation of a repo that:

1. hosts multiple Pi extensions under one workspace
2. includes `implement-issue` as the first extension package
3. registers `/implement-issue <issue-number>` as a real global Pi command
4. works across repositories without project-specific assumptions
5. safely creates or reuses issue worktrees
6. creates a dedicated Pi issue session
7. injects a prompt that causes the agent to follow the `implementer` skill workflow
8. is version-controlled, testable, and installable through Pi’s global extension directory
