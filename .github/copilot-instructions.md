# Spec-Sync Integration

This project uses spec-sync for bidirectional spec-to-code validation.

## Guidelines

- Specs are in `specs/<module>/<module>.spec.md` — read the relevant spec before modifying a module
- Companion files `tasks.md` and `context.md` in each spec directory provide additional context
- After changes, `specsync check` should pass with no errors
- New modules need specs: run `specsync add-spec <module-name>`
- Keep the Public API table in each spec up to date with actual exports
