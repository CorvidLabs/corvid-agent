---
spec: _template.spec.md
sources: []
---

## Layout

This is the root-level design companion for the spec template. Each module's `design.md` documents:

- **Layout** — Module structure, file organization, and directory layout
- **Components** — Key classes, functions, subsystems, and their responsibilities
- **Tokens** — Configuration values, environment variables, constants, and thresholds
- **Assets** — Related resources such as DB tables, external services, and downstream consumers

## Components

For backend modules, this section describes the primary classes, exported functions, and internal subsystems. For frontend modules, it describes the component tree, inputs/outputs, and signal-based state.

## Tokens

Configuration constants, environment variables, timing thresholds, and magic numbers used by the module. Include default values where applicable.

## Assets

Database tables owned or consumed by the module, external service dependencies (APIs, Docker, Algorand), and files or resources the module reads/writes at runtime.
