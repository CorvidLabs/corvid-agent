# Fledge: One CLI for Your Whole Dev Lifecycle — Whether You're Human or AI

*By CorvidLabs | April 2026*

---

Software development has a tooling problem. Not a lack-of-tools problem — the opposite. To go from idea to shipped code, you're stitching together a dozen different tools: Cookiecutter for scaffolding, Make or Just for task running, gh for GitHub, custom scripts for changelogs, more scripts for releases, and probably a few more you've forgotten about. Each one has its own config format, its own mental model, its own way of breaking.

We built **Fledge** to replace that entire pile with a single binary.

## What Is Fledge?

Fledge is a unified CLI tool for the entire development lifecycle, built in Rust. Scaffold a project, build it, review the code, ship a release — all from one command. It works with Rust, TypeScript, Python, Go, Ruby, Java, Swift, and more, auto-detecting your project type and providing sensible defaults out of the box.

```bash
# Start a new project
fledge templates init my-tool --template rust-cli

# Or just use it with an existing project — zero config
cd my-existing-project
fledge run test      # auto-detects project type, runs tests
fledge lane ci       # runs the full CI pipeline
fledge review        # AI-powered code review
fledge release minor # bump version, changelog, tag, push
```

No config files needed for the common case. Fledge inspects your project, figures out what you're working with, and does the right thing.

## The Six Stages

Fledge organizes the dev lifecycle into six interconnected stages:

1. **Start** — Scaffold new projects from built-in or community templates. Six built-in templates (Rust CLI, TypeScript/Bun, Python CLI, Go CLI, TypeScript/Node, static site) plus a growing community collection including Angular, FastAPI, MCP servers, Swift packages, and monorepos.

2. **Build** — A powerful task runner with zero-config defaults. Define custom tasks in `fledge.toml`, or just let Fledge figure it out. For a Rust project, `fledge run test` runs `cargo test`. For a Node project, it runs `npm test`. No configuration required.

3. **Develop** — Branch management with `fledge work`, which creates properly-named feature branches, links GitHub issues, and automates PR creation. Plus `fledge spec` for specification-driven development — write the spec first, then validate your code matches it.

4. **Review** — AI-powered code review with `fledge review`, codebase Q&A with `fledge ask`, code health metrics, dependency audits, and license scanning.

5. **Ship** — Issue and PR management, CI status monitoring, automatic changelog generation from conventional commits, and a full release pipeline that handles version bumping, tagging, and publishing.

6. **Extend** — A plugin system that lets you add custom commands without forking the project.

## A Real Fastlane Replacement

If you've used Fastlane for iOS/Android builds, this will feel familiar — but better. Fastlane gave mobile developers composable "lanes" for automating builds, signing, and deployment. Fledge takes that same concept and generalizes it across every language and platform.

The difference? With Fastlane, you're locked into the Ruby ecosystem, limited to mobile platforms, and dependent on a massive gem dependency tree. With Fledge, you get a single static binary — no runtime dependencies, no gem conflicts, no `bundle install` prayer circles. And your lanes work for Rust, TypeScript, Python, Go, Swift, or anything else.

**You write your own lanes.** That's the point. Your CI pipeline, your release workflow, your deploy process — defined in a simple TOML file that anyone on your team can read and modify:

```toml
[lanes.ci]
steps = [
  { parallel = ["fmt", "lint"] },   # run formatting and linting in parallel
  "test",                            # then tests
  "build"                            # then build
]
fail_fast = true

[lanes.release-prep]
steps = ["lint", "test", "changelog", "build"]

[lanes.deploy]
steps = ["test", "build", { run = "deploy.sh" }]
```

Run it with `fledge lane ci`. Each step is timed, parallel groups execute concurrently, and you get a clear report of what passed and what failed. No magic — just composable steps you define and control.

## Plugins: Extend As Much As You Want

Fledge uses a git-style plugin model. Drop a `fledge-deploy` binary on your PATH, and `fledge deploy` just works.

But it goes further than simple subcommands. Plugins use a structured protocol (JSON over stdin/stdout) with a capabilities model — plugins declare what they need (execute commands, store data, read project metadata) and users approve during installation. No silent privilege escalation.

```bash
fledge plugins install CorvidLabs/fledge-plugin-deploy
fledge deploy staging
```

Plugins can also hook into the lifecycle — running code after `fledge work start`, before PR creation, or after builds.

The plugin system means Fledge never has to say "we don't support that." Need custom deployment logic? Write a plugin. Want to integrate with your internal tools? Write a plugin. Have a niche workflow that no general-purpose tool would ever ship? Write a plugin. The core stays lean while the ecosystem grows.

## For Humans Who Don't Want AI

Let's be clear: **Fledge is a great tool even if you never touch AI features.**

Not everyone wants an AI code reviewer. Not everyone wants automated PR summaries. And that's fine — Fledge doesn't force it on you. The AI features (`fledge review`, `fledge ask`) are entirely optional. Without them, you still get:

- **Zero-config task running** across 8+ languages
- **Lanes** that replace your Makefiles, Justfiles, and shell scripts
- **Project scaffolding** from templates with community sharing
- **Branch management** with consistent naming and PR automation
- **Changelog generation** from conventional commits
- **Release pipeline** — version bump, tag, push, publish in one command
- **Doctor** — verify your entire toolchain in seconds
- **Dependency audits and license scanning**
- **A plugin system** to extend anything

This is a complete dev lifecycle tool on its own merits. No AI subscription required, no API keys needed, no cloud dependency. Just a fast Rust binary that does exactly what you tell it to.

## For Humans Who DO Want AI

Now here's where it gets interesting. If you're a human developer who works alongside AI agents — or just wants AI-powered code review — Fledge becomes the shared interface between you and your AI collaborators.

**Same tools, same workflow, seamless handoff.** When you and an AI agent both use Fledge, you're operating on the same lanes, the same branch conventions, the same project configuration. An agent can pick up where you left off (and vice versa) because the workflow state is the same `fledge.toml`, the same lanes, the same specs.

- You define a `ci` lane → the agent runs the same lane to validate its changes
- You write a spec → the agent runs `fledge spec check` to verify its implementation matches
- You start a feature branch with `fledge work start` → the agent sees the linked issue, the branch naming, the context
- The agent opens a PR → you review it with the same `fledge review` command

No translation layer. No "the AI uses different tools than I do." One workflow for everyone.

## Built for AI Agents Too

At CorvidLabs, our AI agents — CorvidAgent, Magpie, Rook, Jackdaw, and others — do real software engineering work every day. They create branches, write code, run tests, open PRs, and ship releases. Fledge was designed with them in mind from day one.

**What this means in practice:**

- **Zero-config defaults** eliminate the setup barrier. An agent can clone a repo and immediately run `fledge run test` or `fledge lane ci` without needing to understand the project's custom build system.

- **Structured output everywhere.** Every command supports `--json` output for machine parsing. An agent can run `fledge doctor --json` and programmatically check which tools are missing, or `fledge metrics --json` to analyze code health without scraping terminal output.

- **Lanes as executable contracts.** When a human defines a `ci` lane, that same lane runs identically whether triggered by a human, an agent in a worktree, or CI in the cloud. One definition, three contexts, same result.

- **The plugin protocol is agent-native.** JSON-over-stdin/stdout with structured messages means agents can interact with plugins just as naturally as they interact with any other API.

- **Doctor as environment validation.** Before an agent starts work, `fledge doctor` validates the entire toolchain. Missing compiler? Wrong Node version? The agent knows before writing a single line of code.

- **Spec-driven development bridges intent and implementation.** Agents can run `fledge spec check` to verify their code changes actually match the specification — critical for autonomous work where there's no human watching every keystroke.

## Security-First

Because agents and humans share the same tools, security is non-negotiable:

- **Template path traversal protection** — templates can't write outside the project directory
- **Plugin capability model** — explicit permission grants, no silent escalation
- **Config file permissions** — enforced 0600 on sensitive files
- **Token handling** — credentials are never logged, with multiple secure storage options
- **Post-create hook confirmation** — template hooks always ask before executing (unless explicitly bypassed for CI)

## Getting Started

Install Fledge:

```bash
# Homebrew
brew install corvidlabs/tap/fledge

# Cargo
cargo install fledge

# Or curl
curl -fsSL https://raw.githubusercontent.com/CorvidLabs/fledge/main/install.sh | bash
```

Try it on an existing project:

```bash
cd your-project
fledge doctor          # check your environment
fledge run test        # run tests (auto-detected)
fledge lane ci         # run the full CI pipeline
```

Or start something new:

```bash
fledge templates init my-app --template ts-bun
cd my-app
fledge lane ci
```

**Fledge v0.10.0** is available now. Check out the [docs](https://corvidlabs.github.io/fledge/), the [GitHub repo](https://github.com/CorvidLabs/fledge), and the [community templates](https://github.com/CorvidLabs/fledge-templates).

---

*Fledge is open source (MIT) and built by CorvidLabs. We'd love your feedback — open an issue, submit a template, or write a plugin. The dev lifecycle is too important to be fragmented.*
