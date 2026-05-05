/**
 * Unified Discord embed builder for the corvid-agent platform.
 *
 * Provides a canonical color palette, button registry, and a chainable
 * CorvidEmbed builder class that all embed construction sites should use.
 * Integrates with existing footer, author, and action-row helpers from
 * embeds.ts so all formatting stays consistent.
 */

import {
  buildActionRow,
  buildAgentAuthor,
  buildFooterText,
  buildFooterWithStats,
  type ContextUsage,
  type DiscordEmbed,
  type DiscordEmbedAuthor,
  type FooterContext,
  type FooterStats,
} from './embeds';
import { sessionErrorEmbed } from './thread-response/utils';
import type { DiscordActionRow } from './types';
import { ButtonStyle } from './types';

// ── Color palette ────────────────────────────────────────────────────────────

/** Canonical color values for all Discord embeds in the corvid-agent platform. */
export const EMBED_COLORS = {
  /** Gray — neutral / progress / acknowledged */
  neutral: 0x95a5a6,
  /** Blurple — active work / queue */
  working: 0x5865f2,
  /** Green — success / done / warm */
  success: 0x57f287,
  /** Yellow — warning / timeout / validating */
  warning: 0xf0b232,
  /** Red — crash / fatal error */
  error: 0xff3355,
  /** Discord red — task failed */
  errorAlt: 0xed4245,
} as const;

// ── Button registry ──────────────────────────────────────────────────────────

/** Definition of a single button for use with buildActionRow. */
export interface ButtonDef {
  label: string;
  emoji: string;
  customId: string;
  style: number;
}

/** Canonical button definitions for embed action rows. */
export const EMBED_BUTTONS = {
  new_session: {
    label: 'New Session',
    emoji: '🔄',
    customId: 'new_session',
    style: ButtonStyle.SUCCESS,
  },
  archive: {
    label: 'Archive',
    emoji: '📦',
    customId: 'archive_thread',
    style: ButtonStyle.SECONDARY,
  },
  create_issue: {
    label: 'Create Issue',
    emoji: '📋',
    customId: 'create_issue',
    style: ButtonStyle.PRIMARY,
  },
  resume: {
    label: 'Resume',
    emoji: '🔄',
    customId: 'resume_thread',
    style: ButtonStyle.SUCCESS,
  },
  continue_thread: {
    label: 'Continue in Thread',
    emoji: '🧵',
    customId: 'continue_thread',
    style: ButtonStyle.PRIMARY,
  },
} as const satisfies Record<string, ButtonDef>;

export type EmbedButtonKey = keyof typeof EMBED_BUTTONS;

// ── Builder ──────────────────────────────────────────────────────────────────

/** Return type of CorvidEmbed.build(). */
export interface BuiltEmbed {
  embed: DiscordEmbed;
  components?: DiscordActionRow[];
}

/** Agent identity for building embed author blocks. */
export interface EmbedAgentIdentity {
  agentName: string;
  displayIcon?: string | null;
  avatarUrl?: string | null;
}

/**
 * Chainable builder for Discord embeds with auto-constructed footers,
 * author blocks, and button rows.
 *
 * Usage:
 * ```ts
 * const { embed, components } = new CorvidEmbed()
 *   .setTitle('Session complete')
 *   .setDescription('✅ Done')
 *   .setColor(EMBED_COLORS.success)
 *   .setAgent({ agentName: 'Rook', displayIcon: '🐦' })
 *   .withButtons(['new_session', 'archive'])
 *   .build();
 * ```
 */
export class CorvidEmbed {
  private _title?: string;
  private _description?: string;
  private _color?: number;
  private _authorOverride?: DiscordEmbedAuthor;
  private _agentIdentity?: EmbedAgentIdentity;
  private _fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  private _image?: string;
  private _thumbnail?: string;
  private _timestamp?: string;

  // Footer context
  private _agentName?: string;
  private _agentModel?: string;
  private _sessionId?: string;
  private _projectName?: string;
  private _status?: string;
  private _sessionType?: string;

  // Footer
  private _footerOverride?: string;
  private _contextUsage?: ContextUsage;
  private _turns?: number;
  private _cumulativeTurns?: number;
  private _stats?: FooterStats;

  // Buttons
  private _buttonKeys: EmbedButtonKey[] = [];
  private _buttonOverrides: Partial<Record<EmbedButtonKey, string>> = {};

  // ── Chainable setters ──────────────────────────────────────────────

  setTitle(title: string): this {
    this._title = title;
    return this;
  }

  setDescription(description: string): this {
    this._description = description;
    return this;
  }

  setColor(color: number): this {
    this._color = color;
    return this;
  }

  /** Set the agent identity for both author block and footer context. */
  setAgent(identity: EmbedAgentIdentity): this {
    this._agentIdentity = identity;
    this._agentName = identity.agentName;
    return this;
  }

  setModel(model: string): this {
    this._agentModel = model;
    return this;
  }

  setSession(sessionId: string): this {
    this._sessionId = sessionId;
    return this;
  }

  setProject(projectName: string): this {
    this._projectName = projectName;
    return this;
  }

  setStatus(status: string): this {
    this._status = status;
    return this;
  }

  setSessionType(sessionType: string): this {
    this._sessionType = sessionType;
    return this;
  }

  /** Override the author block directly (bypasses setAgent). */
  setAuthor(author: DiscordEmbedAuthor): this {
    this._authorOverride = author;
    return this;
  }

  withContextUsage(usage: ContextUsage): this {
    this._contextUsage = usage;
    return this;
  }

  withTurns(turns: number, cumulativeTurns?: number): this {
    this._turns = turns;
    this._cumulativeTurns = cumulativeTurns;
    return this;
  }

  withStats(stats: FooterStats, cumulativeTurns?: number): this {
    this._stats = stats;
    this._cumulativeTurns = cumulativeTurns;
    return this;
  }

  addField(name: string, value: string, inline?: boolean): this {
    this._fields.push({ name, value, ...(inline !== undefined ? { inline } : {}) });
    return this;
  }

  setFields(fields: Array<{ name: string; value: string; inline?: boolean }>): this {
    this._fields = [...fields];
    return this;
  }

  setImage(url: string): this {
    this._image = url;
    return this;
  }

  setThumbnail(url: string): this {
    this._thumbnail = url;
    return this;
  }

  setFooter(text: string): this {
    this._footerOverride = text;
    return this;
  }

  /**
   * Add buttons to the embed's action row.
   * Keys must be from EMBED_BUTTONS.
   */
  withButtons(keys: EmbedButtonKey[]): this {
    this._buttonKeys = keys;
    return this;
  }

  /**
   * Override the customId for a specific button key at build time.
   * Useful for per-session dynamic button IDs (e.g. `continue_thread:session-id`).
   */
  withButtonOverride(key: EmbedButtonKey, customId: string): this {
    this._buttonOverrides = { ...this._buttonOverrides, [key]: customId };
    return this;
  }

  // ── Build ──────────────────────────────────────────────────────────

  build(): BuiltEmbed {
    const embed: DiscordEmbed = {};

    if (this._title) embed.title = this._title;
    if (this._description) embed.description = this._description;
    if (this._color !== undefined) embed.color = this._color;
    if (this._timestamp) embed.timestamp = this._timestamp;

    if (this._fields.length > 0) {
      embed.fields = this._fields;
    }

    if (this._image) embed.image = { url: this._image };
    if (this._thumbnail) embed.thumbnail = { url: this._thumbnail };

    // Author block — explicit override takes precedence over identity
    if (this._authorOverride) {
      embed.author = this._authorOverride;
    } else if (this._agentIdentity) {
      embed.author = buildAgentAuthor(this._agentIdentity);
    }

    // Footer — explicit override takes precedence, then auto-build from agent context
    if (this._footerOverride) {
      embed.footer = { text: this._footerOverride };
    } else if (this._agentName) {
      const ctx: FooterContext = {
        agentName: this._agentName,
        ...(this._agentModel ? { agentModel: this._agentModel } : {}),
        ...(this._sessionId ? { sessionId: this._sessionId } : {}),
        ...(this._projectName ? { projectName: this._projectName } : {}),
        ...(this._status ? { status: this._status } : {}),
        ...(this._sessionType ? { sessionType: this._sessionType } : {}),
      };

      const footerText = this._stats
        ? buildFooterWithStats(ctx, this._stats, this._contextUsage, this._cumulativeTurns)
        : buildFooterText(ctx, this._contextUsage, this._turns, this._cumulativeTurns);

      embed.footer = { text: footerText };
    }

    // Buttons — only built when keys are set
    let components: DiscordActionRow[] | undefined;
    if (this._buttonKeys.length > 0) {
      const buttonDefs = this._buttonKeys.map((key) => {
        const base = EMBED_BUTTONS[key];
        const customId = this._buttonOverrides[key] ?? base.customId;
        return { label: base.label, emoji: base.emoji, customId, style: base.style };
      });
      components = [buildActionRow(...buttonDefs)];
    }

    return { embed, ...(components ? { components } : {}) };
  }

  // ── Static preset factories ────────────────────────────────────────

  /**
   * Gray "Received — working on it..." progress embed.
   * Sent immediately when a Discord message is received.
   */
  private static applyContext(builder: CorvidEmbed, ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    builder.setAgent(author);
    if (ctx.agentModel) builder.setModel(ctx.agentModel);
    if (ctx.sessionId) builder.setSession(ctx.sessionId);
    if (ctx.projectName) builder.setProject(ctx.projectName);
    return builder;
  }

  static progress(ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed()
      .setDescription('Received — working on it...')
      .setColor(EMBED_COLORS.neutral)
      .setStatus('thinking');
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Gray tool-status embed with a custom message.
   * Used for live tool execution status updates.
   */
  static toolStatus(message: string, ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed().setDescription(`⏳ ${message}`).setColor(EMBED_COLORS.neutral).setStatus('working...');
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Green "✅ Done · Expires <t:X:R>" embed for warm (keep-alive) sessions.
   */
  static warm(ctx: FooterContext, author: EmbedAgentIdentity, expiresAtUnix: number): CorvidEmbed {
    const b = new CorvidEmbed()
      .setDescription(`✅ Done · Expires <t:${expiresAtUnix}:R>`)
      .setColor(EMBED_COLORS.success)
      .setStatus('warm');
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Green "✅ Done" embed for completed sessions.
   * Used when editing the progress embed after a result arrives.
   */
  static done(ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed().setDescription('✅ Done').setColor(EMBED_COLORS.success).setStatus('done');
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Green "Session complete" embed with New Session, Create Issue, and Archive buttons.
   * Sent at the end of a session as the final summary embed.
   */
  static completion(ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed()
      .setDescription('Session complete. Send a message to continue the conversation.')
      .setColor(EMBED_COLORS.success)
      .setStatus('done')
      .withButtons(['new_session', 'create_issue', 'archive']);
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Red "ended unexpectedly" embed with a Resume button.
   * Sent when an agent process crashes.
   */
  static crash(ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed()
      .setDescription('The agent session ended unexpectedly. Send a message to resume.')
      .setColor(EMBED_COLORS.error)
      .setStatus('crashed')
      .withButtons(['resume']);
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Error embed derived from sessionErrorEmbed.
   * Maps known error types (context_exhausted, credits_exhausted, timeout, crash,
   * spawn_error) to user-facing titles, descriptions, and colors.
   */
  static error(
    errorType: string,
    ctx: FooterContext,
    author: EmbedAgentIdentity,
    fallbackMessage?: string,
  ): CorvidEmbed {
    const { title, description, color } = sessionErrorEmbed(errorType, fallbackMessage);
    const b = new CorvidEmbed().setTitle(title).setDescription(description).setColor(color).setStatus(errorType);
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Yellow "taking too long" timeout warning embed.
   */
  static timeout(ctx: FooterContext, author: EmbedAgentIdentity): CorvidEmbed {
    const b = new CorvidEmbed()
      .setDescription('The agent appears to be taking too long. It may still be working — send a message to check.')
      .setColor(EMBED_COLORS.warning);
    return CorvidEmbed.applyContext(b, ctx, author);
  }

  /**
   * Blurple "Task Queued" embed for work task intake.
   */
  static workTaskQueued(taskId: string, description: string, status?: string): CorvidEmbed {
    const truncated = description.slice(0, 200) + (description.length > 200 ? '...' : '');
    return new CorvidEmbed()
      .setTitle('Task Queued')
      .setDescription(`**${taskId}**\n\n${truncated}`)
      .setColor(EMBED_COLORS.working)
      .setFooter(`Status: ${status ?? 'queued'}`);
  }

  /**
   * Blurple/yellow status update embed for running work tasks.
   * Maps branching, running, and validating to appropriate descriptions.
   */
  static workTaskStatus(taskId: string, status: string, iterationCount?: number): CorvidEmbed {
    const statusMap: Record<string, { desc: string; color: number }> = {
      branching: { desc: '⚙️ Setting up workspace and creating branch...', color: EMBED_COLORS.working },
      running: {
        desc: `🤖 Agent working${(iterationCount ?? 1) > 1 ? ` (iteration ${iterationCount})` : ''}...`,
        color: EMBED_COLORS.working,
      },
      validating: { desc: '🔍 Validating changes...', color: EMBED_COLORS.warning },
    };

    const { desc, color } = statusMap[status] ?? {
      desc: `Status: ${status}`,
      color: EMBED_COLORS.working,
    };

    return new CorvidEmbed()
      .setTitle('Task Update')
      .setDescription(`**${taskId}**\n\n${desc}`)
      .setColor(color)
      .setFooter(`Status: ${status}`);
  }

  /**
   * Green "Task Completed" embed for successfully completed work tasks.
   */
  static workTaskCompleted(taskId: string, description: string): CorvidEmbed {
    return new CorvidEmbed()
      .setTitle('Task Completed')
      .setDescription(description.slice(0, 300))
      .setColor(EMBED_COLORS.success)
      .setFooter(`Task: ${taskId}`);
  }

  /**
   * Red alt "Task Failed" embed for failed work tasks.
   */
  static workTaskFailed(taskId: string, description: string): CorvidEmbed {
    return new CorvidEmbed()
      .setTitle('Task Failed')
      .setDescription(description.slice(0, 300))
      .setColor(EMBED_COLORS.errorAlt)
      .setFooter(`Task: ${taskId}`);
  }
}
