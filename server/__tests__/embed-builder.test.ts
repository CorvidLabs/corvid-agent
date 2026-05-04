/**
 * Tests for the unified CorvidEmbed builder.
 *
 * Covers: color palette, button registry, chainable builder, footer
 * construction, context usage, turns, stats, buttons, overrides, author
 * blocks, all preset factory methods, and edge cases.
 */
import { describe, expect, test } from 'bun:test';
import {
  CorvidEmbed,
  EMBED_BUTTONS,
  EMBED_COLORS,
  type EmbedAgentIdentity,
} from '../discord/embed-builder';
import { ButtonStyle } from '../discord/types';
import type { FooterContext } from '../discord/embeds';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CTX: FooterContext = {
  agentName: 'Rook',
  agentModel: 'claude-sonnet-4-6',
  sessionId: 'abcdef1234567890',
  projectName: 'corvid-agent',
};

const AUTHOR: EmbedAgentIdentity = {
  agentName: 'Rook',
  displayIcon: '🐦',
  avatarUrl: 'https://example.com/rook.png',
};

// ── EMBED_COLORS ─────────────────────────────────────────────────────────────

describe('EMBED_COLORS', () => {
  test('has all expected keys', () => {
    expect(EMBED_COLORS).toHaveProperty('neutral');
    expect(EMBED_COLORS).toHaveProperty('working');
    expect(EMBED_COLORS).toHaveProperty('success');
    expect(EMBED_COLORS).toHaveProperty('warning');
    expect(EMBED_COLORS).toHaveProperty('error');
    expect(EMBED_COLORS).toHaveProperty('errorAlt');
  });

  test('neutral is gray (0x95a5a6)', () => {
    expect(EMBED_COLORS.neutral).toBe(0x95a5a6);
  });

  test('working is blurple (0x5865f2)', () => {
    expect(EMBED_COLORS.working).toBe(0x5865f2);
  });

  test('success is green (0x57f287)', () => {
    expect(EMBED_COLORS.success).toBe(0x57f287);
  });

  test('warning is yellow (0xf0b232)', () => {
    expect(EMBED_COLORS.warning).toBe(0xf0b232);
  });

  test('error is red (0xff3355)', () => {
    expect(EMBED_COLORS.error).toBe(0xff3355);
  });

  test('errorAlt is Discord red (0xed4245)', () => {
    expect(EMBED_COLORS.errorAlt).toBe(0xed4245);
  });
});

// ── EMBED_BUTTONS ─────────────────────────────────────────────────────────────

describe('EMBED_BUTTONS', () => {
  test('has all expected keys', () => {
    expect(EMBED_BUTTONS).toHaveProperty('new_session');
    expect(EMBED_BUTTONS).toHaveProperty('archive');
    expect(EMBED_BUTTONS).toHaveProperty('create_issue');
    expect(EMBED_BUTTONS).toHaveProperty('resume');
    expect(EMBED_BUTTONS).toHaveProperty('continue_thread');
  });

  test('new_session has correct shape', () => {
    expect(EMBED_BUTTONS.new_session.label).toBe('New Session');
    expect(EMBED_BUTTONS.new_session.emoji).toBe('🔄');
    expect(EMBED_BUTTONS.new_session.customId).toBe('new_session');
    expect(EMBED_BUTTONS.new_session.style).toBe(ButtonStyle.SUCCESS);
  });

  test('archive has correct shape', () => {
    expect(EMBED_BUTTONS.archive.label).toBe('Archive');
    expect(EMBED_BUTTONS.archive.emoji).toBe('📦');
    expect(EMBED_BUTTONS.archive.customId).toBe('archive_thread');
    expect(EMBED_BUTTONS.archive.style).toBe(ButtonStyle.SECONDARY);
  });

  test('create_issue has correct shape', () => {
    expect(EMBED_BUTTONS.create_issue.label).toBe('Create Issue');
    expect(EMBED_BUTTONS.create_issue.emoji).toBe('📋');
    expect(EMBED_BUTTONS.create_issue.customId).toBe('create_issue');
    expect(EMBED_BUTTONS.create_issue.style).toBe(ButtonStyle.PRIMARY);
  });

  test('resume has correct shape', () => {
    expect(EMBED_BUTTONS.resume.label).toBe('Resume');
    expect(EMBED_BUTTONS.resume.emoji).toBe('🔄');
    expect(EMBED_BUTTONS.resume.customId).toBe('resume_thread');
    expect(EMBED_BUTTONS.resume.style).toBe(ButtonStyle.SUCCESS);
  });

  test('continue_thread has correct shape', () => {
    expect(EMBED_BUTTONS.continue_thread.label).toBe('Continue in Thread');
    expect(EMBED_BUTTONS.continue_thread.emoji).toBe('🧵');
    expect(EMBED_BUTTONS.continue_thread.customId).toBe('continue_thread');
    expect(EMBED_BUTTONS.continue_thread.style).toBe(ButtonStyle.PRIMARY);
  });
});

// ── Builder — basic fields ────────────────────────────────────────────────────

describe('CorvidEmbed builder — basic fields', () => {
  test('setTitle sets title on embed', () => {
    const { embed } = new CorvidEmbed().setTitle('My Title').build();
    expect(embed.title).toBe('My Title');
  });

  test('setDescription sets description on embed', () => {
    const { embed } = new CorvidEmbed().setDescription('My description').build();
    expect(embed.description).toBe('My description');
  });

  test('setColor sets color on embed', () => {
    const { embed } = new CorvidEmbed().setColor(EMBED_COLORS.success).build();
    expect(embed.color).toBe(EMBED_COLORS.success);
  });

  test('addField appends a field', () => {
    const { embed } = new CorvidEmbed().addField('Name', 'Value', true).build();
    expect(embed.fields).toHaveLength(1);
    expect(embed.fields![0]).toEqual({ name: 'Name', value: 'Value', inline: true });
  });

  test('addField without inline does not include inline property', () => {
    const { embed } = new CorvidEmbed().addField('Name', 'Value').build();
    expect(embed.fields![0]).not.toHaveProperty('inline');
  });

  test('setFields replaces all fields', () => {
    const fields = [
      { name: 'A', value: '1' },
      { name: 'B', value: '2', inline: true },
    ];
    const { embed } = new CorvidEmbed()
      .addField('Old', 'field')
      .setFields(fields)
      .build();
    expect(embed.fields).toHaveLength(2);
    expect(embed.fields![0].name).toBe('A');
  });

  test('setImage sets image url', () => {
    const { embed } = new CorvidEmbed().setImage('https://example.com/img.png').build();
    expect(embed.image).toEqual({ url: 'https://example.com/img.png' });
  });

  test('setThumbnail sets thumbnail url', () => {
    const { embed } = new CorvidEmbed().setThumbnail('https://example.com/thumb.png').build();
    expect(embed.thumbnail).toEqual({ url: 'https://example.com/thumb.png' });
  });

  test('build returns no components when no buttons set', () => {
    const result = new CorvidEmbed().setTitle('Test').build();
    expect(result.components).toBeUndefined();
  });

  test('empty builder produces empty embed object', () => {
    const { embed } = new CorvidEmbed().build();
    expect(embed.title).toBeUndefined();
    expect(embed.description).toBeUndefined();
    expect(embed.footer).toBeUndefined();
    expect(embed.author).toBeUndefined();
  });
});

// ── Builder — footer ──────────────────────────────────────────────────────────

describe('CorvidEmbed builder — footer', () => {
  test('no footer produced when no agent is set', () => {
    const { embed } = new CorvidEmbed().setDescription('Hello').build();
    expect(embed.footer).toBeUndefined();
  });

  test('footer excludes agent name (shown in embed author instead)', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .build();
    expect(embed.footer?.text).toBe('');
  });

  test('footer includes shortened model, session, and status', () => {
    const { embed } = new CorvidEmbed()
      .setAgent(AUTHOR)
      .setModel('claude-sonnet-4-6')
      .setSession('abcdef1234567890')
      .setProject('corvid-agent')
      .setStatus('thinking')
      .build();
    const footer = embed.footer!.text;
    expect(footer).toContain('sonnet-4.6');
    expect(footer).toContain('abcdef12');
    expect(footer).not.toContain('Rook');
    expect(footer).not.toContain('corvid-agent');
    expect(footer).toContain('thinking');
  });

  test('presets pass shortened agentModel from FooterContext to footer', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.footer!.text).toContain('sonnet-4.6');
  });

  test('withContextUsage adds usage to footer', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .withContextUsage({ usagePercent: 32, estimatedTokens: 64000, contextWindow: 200000 })
      .build();
    const footer = embed.footer!.text;
    expect(footer).toContain('32%');
    expect(footer).toContain('64k');
    expect(footer).toContain('200k');
  });

  test('withTurns adds turn counter to footer', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .withTurns(5)
      .build();
    expect(embed.footer!.text).toContain('T:5');
  });

  test('withTurns with cumulativeTurns shows T:x(n) format', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .withTurns(5, 23)
      .build();
    expect(embed.footer!.text).toContain('T:5(23)');
  });

  test('withStats uses buildFooterWithStats', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .setStatus('done')
      .withStats({ filesChanged: 3, turns: 7, tools: 15 })
      .build();
    const footer = embed.footer!.text;
    expect(footer).toContain('3 files');
    expect(footer).toContain('7 turns');
    expect(footer).toContain('15 tools');
  });

  test('withStats with cumulativeTurns shows cumulative in footer', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .withStats({ turns: 5, tools: 10 }, 23)
      .build();
    const footer = embed.footer!.text;
    expect(footer).toContain('5 turns (23 total)');
  });

  test('withStats with contextUsage includes both stats and usage', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .withStats({ turns: 3 })
      .withContextUsage({ usagePercent: 50, estimatedTokens: 100000, contextWindow: 200000 })
      .build();
    const footer = embed.footer!.text;
    expect(footer).toContain('3 turns');
    expect(footer).toContain('50%');
  });
});

// ── Builder — author ──────────────────────────────────────────────────────────

describe('CorvidEmbed builder — author', () => {
  test('setAgent builds author from identity', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook', displayIcon: '🐦', avatarUrl: 'https://example.com/rook.png' })
      .build();
    expect(embed.author?.name).toBe('🐦 Rook');
    expect(embed.author?.icon_url).toBe('https://example.com/rook.png');
  });

  test('agent without displayIcon does not prepend emoji to name', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .build();
    expect(embed.author?.name).toBe('Rook');
  });

  test('setAuthor overrides agent-derived author', () => {
    const { embed } = new CorvidEmbed()
      .setAgent({ agentName: 'Rook' })
      .setAuthor({ name: 'Custom Author', icon_url: 'https://example.com/icon.png' })
      .build();
    expect(embed.author?.name).toBe('Custom Author');
    expect(embed.author?.icon_url).toBe('https://example.com/icon.png');
  });

  test('no author when neither setAgent nor setAuthor is called', () => {
    const { embed } = new CorvidEmbed().setTitle('Test').build();
    expect(embed.author).toBeUndefined();
  });
});

// ── Builder — buttons ─────────────────────────────────────────────────────────

describe('CorvidEmbed builder — buttons', () => {
  test('withButtons produces action row components', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['new_session', 'archive'])
      .build();
    expect(components).toHaveLength(1);
    expect(components![0].components).toHaveLength(2);
  });

  test('button labels match EMBED_BUTTONS definitions', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['new_session', 'create_issue', 'archive'])
      .build();
    const labels = components![0].components.map((b) => b.label);
    expect(labels).toContain('New Session');
    expect(labels).toContain('Create Issue');
    expect(labels).toContain('Archive');
  });

  test('button customIds match EMBED_BUTTONS definitions', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['resume'])
      .build();
    expect(components![0].components[0].custom_id).toBe('resume_thread');
  });

  test('withButtonOverride changes customId for specified key', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['continue_thread'])
      .withButtonOverride('continue_thread', 'continue_thread:session-xyz')
      .build();
    expect(components![0].components[0].custom_id).toBe('continue_thread:session-xyz');
  });

  test('withButtonOverride does not affect other buttons', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['new_session', 'continue_thread'])
      .withButtonOverride('continue_thread', 'continue_thread:sess')
      .build();
    expect(components![0].components[0].custom_id).toBe('new_session');
    expect(components![0].components[1].custom_id).toBe('continue_thread:sess');
  });

  test('no components when withButtons is not called', () => {
    const result = new CorvidEmbed().setDescription('Hello').build();
    expect(result.components).toBeUndefined();
  });

  test('button emoji is set on action row component', () => {
    const { components } = new CorvidEmbed()
      .withButtons(['archive'])
      .build();
    expect(components![0].components[0].emoji?.name).toBe('📦');
  });
});

// ── Preset: progress ──────────────────────────────────────────────────────────

describe('CorvidEmbed.progress()', () => {
  test('has correct color', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.neutral);
  });

  test('description contains working phrase', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.description).toContain('working on it');
  });

  test('footer contains shortened model, not agent name', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.footer?.text).toContain('sonnet-4.6');
    expect(embed.footer?.text).not.toContain('Rook');
  });

  test('footer status is thinking', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.footer?.text).toContain('thinking');
  });

  test('author block is built from identity', () => {
    const { embed } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(embed.author?.name).toContain('Rook');
  });

  test('no buttons', () => {
    const { components } = CorvidEmbed.progress(CTX, AUTHOR).build();
    expect(components).toBeUndefined();
  });
});

// ── Preset: toolStatus ────────────────────────────────────────────────────────

describe('CorvidEmbed.toolStatus()', () => {
  test('description has hourglass prefix and message', () => {
    const { embed } = CorvidEmbed.toolStatus('Running tests...', CTX, AUTHOR).build();
    expect(embed.description).toBe('⏳ Running tests...');
  });

  test('color is neutral gray', () => {
    const { embed } = CorvidEmbed.toolStatus('Checking files', CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.neutral);
  });

  test('footer status is working...', () => {
    const { embed } = CorvidEmbed.toolStatus('Doing stuff', CTX, AUTHOR).build();
    expect(embed.footer?.text).toContain('working...');
  });
});

// ── Preset: warm ──────────────────────────────────────────────────────────────

describe('CorvidEmbed.warm()', () => {
  test('description contains Discord timestamp', () => {
    const unix = 1800000000;
    const { embed } = CorvidEmbed.warm(CTX, AUTHOR, unix).build();
    expect(embed.description).toContain(`<t:${unix}:R>`);
  });

  test('description starts with ✅ Done', () => {
    const { embed } = CorvidEmbed.warm(CTX, AUTHOR, 9999999).build();
    expect(embed.description).toMatch(/^✅ Done/);
  });

  test('color is success green', () => {
    const { embed } = CorvidEmbed.warm(CTX, AUTHOR, 9999999).build();
    expect(embed.color).toBe(EMBED_COLORS.success);
  });

  test('footer status is warm', () => {
    const { embed } = CorvidEmbed.warm(CTX, AUTHOR, 9999999).build();
    expect(embed.footer?.text).toContain('warm');
  });
});

// ── Preset: done ─────────────────────────────────────────────────────────────

describe('CorvidEmbed.done()', () => {
  test('description is ✅ Done', () => {
    const { embed } = CorvidEmbed.done(CTX, AUTHOR).build();
    expect(embed.description).toBe('✅ Done');
  });

  test('color is success green', () => {
    const { embed } = CorvidEmbed.done(CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.success);
  });

  test('footer status is done', () => {
    const { embed } = CorvidEmbed.done(CTX, AUTHOR).build();
    expect(embed.footer?.text).toContain('done');
  });
});

// ── Preset: completion ────────────────────────────────────────────────────────

describe('CorvidEmbed.completion()', () => {
  test('color is success green', () => {
    const { embed } = CorvidEmbed.completion(CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.success);
  });

  test('has New Session, Create Issue, and Archive buttons', () => {
    const { components } = CorvidEmbed.completion(CTX, AUTHOR).build();
    const labels = components![0].components.map((b) => b.label);
    expect(labels).toContain('New Session');
    expect(labels).toContain('Create Issue');
    expect(labels).toContain('Archive');
  });

  test('description mentions session complete', () => {
    const { embed } = CorvidEmbed.completion(CTX, AUTHOR).build();
    expect(embed.description?.toLowerCase()).toContain('session complete');
  });
});

// ── Preset: crash ─────────────────────────────────────────────────────────────

describe('CorvidEmbed.crash()', () => {
  test('color is error red', () => {
    const { embed } = CorvidEmbed.crash(CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.error);
  });

  test('description mentions ended unexpectedly', () => {
    const { embed } = CorvidEmbed.crash(CTX, AUTHOR).build();
    expect(embed.description?.toLowerCase()).toContain('ended unexpectedly');
  });

  test('has Resume button', () => {
    const { components } = CorvidEmbed.crash(CTX, AUTHOR).build();
    const labels = components![0].components.map((b) => b.label);
    expect(labels).toContain('Resume');
  });
});

// ── Preset: error ─────────────────────────────────────────────────────────────

describe('CorvidEmbed.error()', () => {
  test('context_exhausted maps to correct title and yellow color', () => {
    const { embed } = CorvidEmbed.error('context_exhausted', CTX, AUTHOR).build();
    expect(embed.title).toBe('Context Limit Reached');
    expect(embed.color).toBe(0xf0b232);
  });

  test('credits_exhausted maps to correct title', () => {
    const { embed } = CorvidEmbed.error('credits_exhausted', CTX, AUTHOR).build();
    expect(embed.title).toBe('Credits Exhausted');
  });

  test('crash type maps to red color', () => {
    const { embed } = CorvidEmbed.error('crash', CTX, AUTHOR).build();
    expect(embed.color).toBe(0xff3355);
  });

  test('unknown error type uses fallback message', () => {
    const { embed } = CorvidEmbed.error('unknown_error', CTX, AUTHOR, 'Custom fallback message').build();
    expect(embed.title).toBe('Session Error');
    expect(embed.description).toBe('Custom fallback message');
  });

  test('footer contains shortened model, not agent name', () => {
    const { embed } = CorvidEmbed.error('timeout', CTX, AUTHOR).build();
    expect(embed.footer?.text).toContain('sonnet-4.6');
    expect(embed.footer?.text).not.toContain('Rook');
  });
});

// ── Preset: timeout ───────────────────────────────────────────────────────────

describe('CorvidEmbed.timeout()', () => {
  test('color is warning yellow', () => {
    const { embed } = CorvidEmbed.timeout(CTX, AUTHOR).build();
    expect(embed.color).toBe(EMBED_COLORS.warning);
  });

  test('description mentions taking too long', () => {
    const { embed } = CorvidEmbed.timeout(CTX, AUTHOR).build();
    expect(embed.description?.toLowerCase()).toContain('taking too long');
  });
});

// ── Preset: workTaskQueued ────────────────────────────────────────────────────

describe('CorvidEmbed.workTaskQueued()', () => {
  test('title is Task Queued', () => {
    const { embed } = CorvidEmbed.workTaskQueued('task-123', 'Write tests').build();
    expect(embed.title).toBe('Task Queued');
  });

  test('color is blurple working', () => {
    const { embed } = CorvidEmbed.workTaskQueued('task-123', 'Write tests').build();
    expect(embed.color).toBe(EMBED_COLORS.working);
  });

  test('description contains task id', () => {
    const { embed } = CorvidEmbed.workTaskQueued('task-abc', 'Do something').build();
    expect(embed.description).toContain('task-abc');
  });

  test('long descriptions are truncated at 200 chars with ellipsis', () => {
    const longDesc = 'x'.repeat(250);
    const { embed } = CorvidEmbed.workTaskQueued('task-1', longDesc).build();
    expect(embed.description).toContain('...');
    // 200 chars of x + "..." = 203 chars, plus "**task-1**\n\n" prefix
    const parts = embed.description!.split('\n\n');
    expect(parts[1].length).toBeLessThanOrEqual(203);
  });

  test('short descriptions are not truncated', () => {
    const { embed } = CorvidEmbed.workTaskQueued('task-1', 'Short').build();
    expect(embed.description).not.toContain('...');
  });
});

// ── Preset: workTaskStatus ────────────────────────────────────────────────────

describe('CorvidEmbed.workTaskStatus()', () => {
  test('branching status produces workspace message', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'branching').build();
    expect(embed.description).toContain('workspace');
    expect(embed.color).toBe(EMBED_COLORS.working);
  });

  test('running status mentions agent working', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'running').build();
    expect(embed.description).toContain('Agent working');
    expect(embed.color).toBe(EMBED_COLORS.working);
  });

  test('running with iteration > 1 shows iteration count', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'running', 3).build();
    expect(embed.description).toContain('iteration 3');
  });

  test('validating status uses yellow color', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'validating').build();
    expect(embed.color).toBe(EMBED_COLORS.warning);
    expect(embed.description).toContain('Validating');
  });

  test('unknown status falls back to working color', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'queued').build();
    expect(embed.color).toBe(EMBED_COLORS.working);
  });

  test('title is Task Update', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-1', 'running').build();
    expect(embed.title).toBe('Task Update');
  });

  test('description contains task id', () => {
    const { embed } = CorvidEmbed.workTaskStatus('task-xyz', 'branching').build();
    expect(embed.description).toContain('task-xyz');
  });
});

// ── Preset: workTaskCompleted ─────────────────────────────────────────────────

describe('CorvidEmbed.workTaskCompleted()', () => {
  test('title is Task Completed', () => {
    const { embed } = CorvidEmbed.workTaskCompleted('task-1', 'Did the thing').build();
    expect(embed.title).toBe('Task Completed');
  });

  test('color is success green', () => {
    const { embed } = CorvidEmbed.workTaskCompleted('task-1', 'Did the thing').build();
    expect(embed.color).toBe(EMBED_COLORS.success);
  });

  test('description contains task description', () => {
    const { embed } = CorvidEmbed.workTaskCompleted('task-1', 'Did the thing').build();
    expect(embed.description).toBe('Did the thing');
  });

  test('long descriptions are truncated at 300 chars', () => {
    const { embed } = CorvidEmbed.workTaskCompleted('task-1', 'x'.repeat(400)).build();
    expect(embed.description?.length).toBeLessThanOrEqual(300);
  });

  test('has task id in footer', () => {
    const { embed } = CorvidEmbed.workTaskCompleted('task-abc', 'Done').build();
    expect(embed.footer?.text).toBe('Task: task-abc');
  });
});

// ── Preset: workTaskFailed ────────────────────────────────────────────────────

describe('CorvidEmbed.workTaskFailed()', () => {
  test('title is Task Failed', () => {
    const { embed } = CorvidEmbed.workTaskFailed('task-1', 'Something broke').build();
    expect(embed.title).toBe('Task Failed');
  });

  test('color is errorAlt (Discord red)', () => {
    const { embed } = CorvidEmbed.workTaskFailed('task-1', 'Something broke').build();
    expect(embed.color).toBe(EMBED_COLORS.errorAlt);
  });

  test('description contains failure description', () => {
    const { embed } = CorvidEmbed.workTaskFailed('task-1', 'Something broke').build();
    expect(embed.description).toBe('Something broke');
  });

  test('long descriptions are truncated at 300 chars', () => {
    const { embed } = CorvidEmbed.workTaskFailed('task-1', 'x'.repeat(400)).build();
    expect(embed.description?.length).toBeLessThanOrEqual(300);
  });

  test('has task id in footer', () => {
    const { embed } = CorvidEmbed.workTaskFailed('task-xyz', 'Failed').build();
    expect(embed.footer?.text).toBe('Task: task-xyz');
  });
});

// ── Chaining ──────────────────────────────────────────────────────────────────

describe('CorvidEmbed chaining', () => {
  test('all setters return the same builder instance', () => {
    const builder = new CorvidEmbed();
    expect(builder.setTitle('T')).toBe(builder);
    expect(builder.setDescription('D')).toBe(builder);
    expect(builder.setColor(0)).toBe(builder);
    expect(builder.setAgent({ agentName: 'X' })).toBe(builder);
    expect(builder.setSession('s')).toBe(builder);
    expect(builder.setProject('p')).toBe(builder);
    expect(builder.setStatus('st')).toBe(builder);
    expect(builder.setAuthor({ name: 'A' })).toBe(builder);
    expect(builder.withContextUsage({ usagePercent: 1, estimatedTokens: 1, contextWindow: 1 })).toBe(builder);
    expect(builder.withTurns(1)).toBe(builder);
    expect(builder.withStats({})).toBe(builder);
    expect(builder.addField('n', 'v')).toBe(builder);
    expect(builder.setFields([])).toBe(builder);
    expect(builder.setImage('u')).toBe(builder);
    expect(builder.setThumbnail('u')).toBe(builder);
    expect(builder.withButtons(['archive'])).toBe(builder);
    expect(builder.withButtonOverride('archive', 'x')).toBe(builder);
  });

  test('full chained build produces expected embed', () => {
    const { embed, components } = new CorvidEmbed()
      .setTitle('Session Done')
      .setDescription('✅ Done')
      .setColor(EMBED_COLORS.success)
      .setAgent({ agentName: 'Rook', displayIcon: '🐦' })
      .setSession('sess-001')
      .setProject('my-project')
      .setStatus('done')
      .withTurns(10)
      .withButtons(['new_session', 'archive'])
      .build();

    expect(embed.title).toBe('Session Done');
    expect(embed.description).toBe('✅ Done');
    expect(embed.color).toBe(EMBED_COLORS.success);
    expect(embed.author?.name).toBe('🐦 Rook');
    expect(embed.footer?.text).not.toContain('Rook');
    expect(embed.footer?.text).toContain('T:10');
    expect(components).toHaveLength(1);
    expect(components![0].components).toHaveLength(2);
  });
});
