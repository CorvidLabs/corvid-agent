# Shared (Client Components) — Context

## Why This Module Exists

The Angular client has reusable components that are used across multiple features. The shared module contains these components — like the cron editor, which provides a user-friendly interface for editing cron expressions with presets and validation.

## Architectural Role

Shared is a **component library** for the Angular frontend — standalone components that features import as needed.

## Key Design Decisions

- **Standalone components**: All shared components are Angular standalone components, avoiding NgModule boilerplate and enabling tree-shaking.
- **Cron editor as representative**: The cron editor exemplifies the shared pattern — reusable, self-contained, with its own validation and display logic.
- **Shared types**: TypeScript types used by both server and client live in the top-level `shared/` directory (not this spec's scope), while client-only components live here.

## Relationship to Other Modules

- **Client**: Shared components are consumed by feature components across the dashboard.
- **Scheduler**: The cron editor uses the cron-human pipe for display, which corresponds to the server-side cron parser.
