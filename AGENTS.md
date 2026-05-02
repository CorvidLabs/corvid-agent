# Spec-Sync Integration

This project uses [spec-sync](https://github.com/CorvidLabs/spec-sync) for bidirectional spec-to-code validation.

## Companion files

Each spec in `specs/<module>/` has companion files — read them before working, update them after:

- **`requirements.md`** — Acceptance criteria and user stories. These are permanent invariants, not tasks — do not check them off. Update if requirements change.
- **`context.md`** — Architectural decisions, key files, and current status. Update when you make design decisions or change what's in progress.

## Before modifying any module

1. Read the relevant spec in `specs/<module>/<module>.spec.md`
2. Read companion files: `requirements.md` and `context.md`
3. After changes, run `fledge run spec-check` to verify specs still pass

## After completing work

1. Update `context.md` — record decisions made, update current status
2. If requirements changed, update `requirements.md` acceptance criteria

## Before creating a PR

Run `fledge run spec-check` — all specs must pass.

## When adding new modules

Run `bun run spec:add <module-name>` to scaffold the spec and companion files, then fill in the spec before writing code.

## Key commands

- `fledge run spec-check` — validate all specs against source code
- `bun run spec:check -- --json` — machine-readable validation output
- `bun run spec:coverage` — show which modules lack specs
- `bun run spec:score` — quality score for each spec (0-100)
- `bun run spec:add <name>` — scaffold a new spec with companion files
