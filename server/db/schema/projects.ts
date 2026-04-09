/** Projects, skill bundles, plugins, and MCP server configs. */

export const tables: string[] = [
  `CREATE TABLE IF NOT EXISTS mcp_server_configs (
        id         TEXT PRIMARY KEY,
        agent_id   TEXT DEFAULT NULL REFERENCES agents(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        command    TEXT NOT NULL,
        args       TEXT NOT NULL DEFAULT '[]',
        env_vars   TEXT NOT NULL DEFAULT '{}',
        cwd        TEXT DEFAULT NULL,
        enabled    INTEGER NOT NULL DEFAULT 1,
        tenant_id  TEXT NOT NULL DEFAULT 'default',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS plugin_capabilities (
        plugin_name TEXT NOT NULL REFERENCES plugins(name) ON DELETE CASCADE,
        capability  TEXT NOT NULL,
        granted     INTEGER DEFAULT 0,
        granted_at  TEXT DEFAULT NULL,
        PRIMARY KEY (plugin_name, capability)
    )`,

  `CREATE TABLE IF NOT EXISTS plugins (
        name         TEXT PRIMARY KEY,
        package_name TEXT NOT NULL,
        version      TEXT NOT NULL,
        description  TEXT DEFAULT '',
        author       TEXT DEFAULT '',
        capabilities TEXT NOT NULL DEFAULT '[]',
        status       TEXT DEFAULT 'active',
        loaded_at    TEXT DEFAULT (datetime('now')),
        config       TEXT DEFAULT '{}'
    )`,

  `CREATE TABLE IF NOT EXISTS project_skills (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        bundle_id  TEXT NOT NULL REFERENCES skill_bundles(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, bundle_id)
    )`,

  `CREATE TABLE IF NOT EXISTS projects (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT DEFAULT '',
        working_dir     TEXT NOT NULL,
        claude_md       TEXT DEFAULT '',
        env_vars        TEXT DEFAULT '{}',
        git_url         TEXT DEFAULT NULL,
        dir_strategy    TEXT NOT NULL DEFAULT 'persistent',
        base_clone_path TEXT DEFAULT NULL,
        tenant_id       TEXT NOT NULL DEFAULT 'default',
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )`,

  `CREATE TABLE IF NOT EXISTS skill_bundles (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL UNIQUE,
        description      TEXT DEFAULT '',
        tools            TEXT NOT NULL DEFAULT '[]',
        prompt_additions TEXT DEFAULT '',
        preset           INTEGER DEFAULT 0,
        created_at       TEXT DEFAULT (datetime('now')),
        updated_at       TEXT DEFAULT (datetime('now'))
    )`,
];

export const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_mcp_server_configs_agent ON mcp_server_configs(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_server_configs_tenant ON mcp_server_configs(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_project_skills_project ON project_skills(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_tenant_name ON projects(tenant_id, name COLLATE NOCASE)`,
];

export const seedData: string[] = [
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-code-reviewer', 'Code Reviewer', 'Review pull requests and provide feedback', '["corvid_github_list_prs","corvid_github_review_pr","corvid_github_get_pr_diff","corvid_github_comment_on_pr"]', 'You are an expert code reviewer. Focus on code quality, security, performance, and maintainability. Provide specific, actionable feedback.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-devops', 'DevOps', 'Infrastructure and deployment automation', '["corvid_create_work_task","corvid_github_create_pr","corvid_github_fork_repo"]', 'You specialize in DevOps practices. Focus on CI/CD, infrastructure-as-code, monitoring, and deployment automation.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-researcher', 'Researcher', 'Deep research and information gathering', '["corvid_web_search","corvid_deep_research","corvid_save_memory","corvid_recall_memory"]', 'You are a thorough researcher. Gather comprehensive information, cross-reference sources, and synthesize findings into clear summaries.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-communicator', 'Communicator', 'Inter-agent and external communication', '["corvid_send_message","corvid_list_agents","corvid_discover_agent","corvid_invoke_remote_agent"]', 'You excel at communication and coordination. Draft clear messages, manage conversations, and facilitate collaboration between agents.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-analyst', 'Analyst', 'Code analysis and health monitoring', '["corvid_check_health_trends","corvid_check_reputation","corvid_github_repo_info","corvid_github_list_issues"]', 'You are a data-driven analyst. Examine metrics, identify trends, and provide actionable insights from codebase health and project data.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-coder', 'Coder', 'Read, write, and edit code with command execution', '["read_file","write_file","edit_file","run_command","list_files","search_files"]', 'You are an expert coder. Read files to understand context before making changes. Use edit_file for targeted modifications and write_file only for new files. Always verify changes by reading the result. Run commands to test and validate your work.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-github-ops', 'GitHub Ops', 'GitHub PR and issue management', '["corvid_github_list_prs","corvid_github_get_pr_diff","corvid_github_review_pr","corvid_github_comment_on_pr","corvid_github_create_pr","corvid_github_create_issue","corvid_github_list_issues","corvid_github_repo_info"]', 'You specialize in GitHub operations. Review PRs thoroughly by reading diffs before commenting. When creating issues or PRs, write clear titles and descriptions. Check existing issues before creating duplicates.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-full-stack', 'Full Stack', 'Code, GitHub, tasks, and web search combined', '["read_file","write_file","edit_file","run_command","list_files","search_files","corvid_github_list_prs","corvid_github_get_pr_diff","corvid_github_review_pr","corvid_github_comment_on_pr","corvid_github_create_pr","corvid_github_create_issue","corvid_github_list_issues","corvid_create_work_task","corvid_web_search"]', 'You are a full-stack developer agent. You can read and edit code, run commands, manage GitHub PRs and issues, and create work tasks. Approach problems methodically: understand the codebase first, make targeted changes, test your work, then create PRs or report findings.', 1)`,
  `INSERT OR IGNORE INTO skill_bundles (id, name, description, tools, prompt_additions, preset) VALUES
        ('preset-memory-manager', 'Memory Manager', 'Knowledge and memory management with research', '["corvid_save_memory","corvid_recall_memory","corvid_web_search","corvid_deep_research"]', 'You manage knowledge and memory. Save important findings, decisions, and context using structured keys. Recall relevant memories before starting new work. Use web search and deep research to fill knowledge gaps.', 1)`,
];
