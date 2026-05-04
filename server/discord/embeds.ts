/**
 * Discord embed builders and interaction responders.
 *
 * Low-level Discord API helpers for sending messages, embeds, reactions,
 * and responding to interactions. All REST calls go through the discord.js
 * REST client (rest-client.ts), which handles rate limiting automatically.
 */

import { MessageFlags, type RepliableInteraction } from 'discord.js';
import type { DeliveryTracker } from '../lib/delivery-tracker';
import { createLogger } from '../lib/logger';
import { splitMessage } from './message-formatter';
import { getRestClient } from './rest-client';
import type { DiscordActionRow } from './types';
import { ButtonStyle, ComponentType } from './types';

const log = createLogger('DiscordEmbeds');

const MAX_MESSAGE_LENGTH = 2000;

/** Discord mention pattern: <@123456789> or <@!123456789> */
const MENTION_RE = /<@!?\d{17,20}>/g;

/** Standalone URL pattern — matches http(s) URLs not already inside markdown or angle brackets */
const STANDALONE_URL_RE = /(?<![(<[])(https?:\/\/[^\s>)\]]+)/g;

/**
 * Extract Discord mentions from embed text so they can be placed in the
 * top-level `content` field.  Mentions inside embeds render as blue text but
 * do NOT ping; placing them in `content` restores native Discord behaviour.
 *
 * NOTE: URLs are handled separately — see {@link extractUrlsFromEmbed} and
 * {@link stripUrlsFromEmbed}.  Discord won't auto-unfurl URLs in `content`
 * when the message also contains rich embeds, so URLs must be sent as a
 * separate follow-up message with no embeds attached.
 */
export function extractContentFromEmbed(embed: DiscordEmbed): string | undefined {
  const desc = embed.description;
  if (!desc) return undefined;
  const mentions = desc.match(MENTION_RE);
  if (!mentions || mentions.length === 0) return undefined;
  return Array.from(new Set(mentions)).join(' ');
}

/**
 * Extract standalone URLs from embed description.
 * Returns deduplicated URLs or undefined if none found.
 */
export function extractUrlsFromEmbed(embed: DiscordEmbed): string[] | undefined {
  const desc = embed.description;
  if (!desc) return undefined;
  const urls = desc.match(STANDALONE_URL_RE);
  if (!urls || urls.length === 0) return undefined;
  return Array.from(new Set(urls));
}

/**
 * Return a shallow copy of the embed with standalone URLs stripped from
 * the description.  The original embed is not mutated.
 */
export function stripUrlsFromEmbed(embed: DiscordEmbed): DiscordEmbed {
  if (!embed.description) return embed;
  const stripped = embed.description
    .replace(STANDALONE_URL_RE, '')
    .replace(/\n{3,}/g, '\n\n') // collapse triple+ newlines
    .trim();
  return { ...embed, description: stripped || undefined };
}

/** When URL stripping removed all narrative text, explain why a follow-up message may appear. */
const EMBED_LINK_STRIP_FALLBACK =
  'Links are in the next message (Discord only previews URLs when they are not attached to an embed).';

/** Footer-only embeds confuse users; always provide a visible body when nothing else renders. */
const EMBED_EMPTY_BODY_FALLBACK = 'No text to display.';

function hasVisibleEmbedBody(e: DiscordEmbed): boolean {
  if (e.title?.trim()) return true;
  if (e.description?.trim()) return true;
  if (e.fields?.some((f) => f.name?.trim() || f.value?.trim())) return true;
  if (e.image?.url?.trim()) return true;
  if (e.thumbnail?.url?.trim()) return true;
  return false;
}

/**
 * Ensure an embed will show readable body text in Discord, not just a footer.
 * Call after {@link stripUrlsFromEmbed} when sending embeds to channels.
 */
export function ensureDiscordEmbedRenderable(
  embed: DiscordEmbed,
  opts?: { urlStripRemovedAllText?: boolean },
): DiscordEmbed {
  const e: DiscordEmbed = { ...embed };
  if (typeof e.description === 'string') {
    const t = e.description.trim();
    e.description = t.length > 0 ? t : undefined;
  }
  if (hasVisibleEmbedBody(e)) return e;
  if (opts?.urlStripRemovedAllText) {
    return { ...e, description: EMBED_LINK_STRIP_FALLBACK };
  }
  return { ...e, description: EMBED_EMPTY_BODY_FALLBACK };
}

function prepareOutboundEmbed(embed: DiscordEmbed): DiscordEmbed {
  const urlList = extractUrlsFromEmbed(embed);
  const hadDesc = Boolean(embed.description?.trim());
  const stripped = urlList ? stripUrlsFromEmbed(embed) : embed;
  const urlStripRemovedAllText = Boolean(urlList && hadDesc && !stripped.description?.trim());
  return ensureDiscordEmbedRenderable(stripped, { urlStripRemovedAllText });
}

/** @deprecated Use extractContentFromEmbed instead */
export const extractMentionsFromEmbed = extractContentFromEmbed;

/** Discord snowflake IDs are purely numeric strings. */
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/;

/** Discord interaction tokens are alphanumeric with dashes, dots, and underscores. */
const DISCORD_TOKEN_RE = /^[\w.-]{20,500}$/;

export function assertSnowflake(value: string, label: string): void {
  if (!DISCORD_SNOWFLAKE_RE.test(value)) {
    throw new Error(`Invalid Discord ${label}: expected snowflake ID (17-20 digit numeric string)`);
  }
}

export function assertInteractionToken(value: string): void {
  if (!DISCORD_TOKEN_RE.test(value)) {
    throw new Error(
      'Invalid Discord interaction token (expected 20-500 alphanumeric characters with dashes, dots, or underscores)',
    );
  }
}

export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  author?: DiscordEmbedAuthor;
  timestamp?: string;
  image?: { url: string };
  thumbnail?: { url: string };
}

/** Metadata for building rich embed footers with session context. */
export interface FooterContext {
  agentName: string;
  agentModel?: string;
  sessionId?: string;
  projectName?: string;
  status?: string;
}

/** Stats that can be appended to the footer on completion embeds. */
export interface FooterStats {
  filesChanged?: number;
  turns?: number;
  tools?: number;
  commits?: number;
}

/** Context window usage data for footer display. */
export interface ContextUsage {
  usagePercent: number;
  estimatedTokens: number;
  contextWindow: number;
}

/**
 * Format context usage as a compact footer segment.
 * Example: `🟢 32.5% (64k/200k)`
 */
export function formatContextUsage(usage: ContextUsage): string {
  const pct = (usage.estimatedTokens / usage.contextWindow) * 100;
  const emoji = pct >= 80 ? '🔴' : pct >= 60 ? '🟠' : pct >= 40 ? '🟡' : pct >= 20 ? '🟢' : '⚪';
  const used = formatTokenCount(usage.estimatedTokens);
  const max = formatTokenCount(usage.contextWindow);
  return `${emoji} ${Math.round(pct)}% (${used}/${max})`;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * Build a detailed footer string with full session context.
 * Format: `AgentName · model · project · sid:XXXXXX · status | T:5(23) | 🟢 32% (64k/200k)`
 * When cumulativeTurns equals active turns, shows just `T:5`.
 * Segments are omitted when their value is not provided.
 */
export function buildFooterText(
  ctx: FooterContext,
  contextUsage?: ContextUsage,
  turns?: number,
  cumulativeTurns?: number,
): string {
  const parts: string[] = [ctx.agentName];
  if (ctx.agentModel) {
    parts.push(ctx.agentModel);
  }
  if (ctx.projectName) {
    parts.push(ctx.projectName);
  }
  if (ctx.sessionId) {
    parts.push(`sid:${ctx.sessionId.slice(0, 8)}`);
  }
  if (ctx.status) {
    parts.push(ctx.status);
  }
  const base = parts.join(' · ');
  const segments: string[] = [base];
  if (turns && turns > 0) {
    if (cumulativeTurns && cumulativeTurns > turns) {
      segments.push(`T:${turns}(${cumulativeTurns})`);
    } else {
      segments.push(`T:${turns}`);
    }
  }
  if (contextUsage) {
    segments.push(formatContextUsage(contextUsage));
  }
  return segments.join(' | ');
}

/**
 * Build a footer with session context AND run stats.
 * Format: `AgentName · model · sid:XXXXXX · status | 5 files · 12 turns (23 total) · 38 tools | 🟢 32% (64k/200k)`
 */
export function buildFooterWithStats(
  ctx: FooterContext,
  stats: FooterStats,
  contextUsage?: ContextUsage,
  cumulativeTurns?: number,
): string {
  const base = buildFooterText(ctx);
  const statParts: string[] = [];
  if (stats.filesChanged && stats.filesChanged > 0) {
    statParts.push(`${stats.filesChanged} files`);
  }
  if (stats.turns && stats.turns > 0) {
    if (cumulativeTurns && cumulativeTurns > stats.turns) {
      statParts.push(`${stats.turns} turns (${cumulativeTurns} total)`);
    } else {
      statParts.push(`${stats.turns} turns`);
    }
  }
  if (stats.tools && stats.tools > 0) {
    statParts.push(`${stats.tools} tools`);
  }
  if (stats.commits && stats.commits > 0) {
    statParts.push(`${stats.commits} commits`);
  }
  const segments: string[] = [base];
  if (statParts.length > 0) segments.push(statParts.join(' · '));
  if (contextUsage) segments.push(formatContextUsage(contextUsage));
  return segments.join(' | ');
}

export async function respondToInteraction(interaction: RepliableInteraction, content: string): Promise<void> {
  try {
    await interaction.reply({ content: content.slice(0, MAX_MESSAGE_LENGTH) });
  } catch (error) {
    log.error('Failed to respond to Discord interaction', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function respondToInteractionEmbed(
  interaction: RepliableInteraction,
  embed: DiscordEmbed,
  ephemeral = false,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await interaction.reply({ embeds: [embed as any], ...(ephemeral && { flags: MessageFlags.Ephemeral }) });
  } catch (error) {
    log.error('Failed to respond to Discord interaction with embed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function respondToInteractionEmbeds(
  interaction: RepliableInteraction,
  embeds: DiscordEmbed[],
  ephemeral = false,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await interaction.reply({ embeds: embeds as any[], ...(ephemeral && { flags: MessageFlags.Ephemeral }) });
  } catch (error) {
    log.error('Failed to respond to Discord interaction with embeds', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Defer a slash command response — shows "thinking..." in Discord.
 * Follow up later with editDeferredResponse().
 */
export async function deferInteraction(interaction: RepliableInteraction, ephemeral = false): Promise<void> {
  try {
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
  } catch (error) {
    log.error('Failed to defer interaction', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Edit the deferred "thinking..." response with the final content.
 */
export async function editDeferredResponse(
  interaction: RepliableInteraction,
  content: string,
  embeds?: DiscordEmbed[],
): Promise<void> {
  try {
    const body: Record<string, unknown> = {};
    if (content) body.content = content.slice(0, MAX_MESSAGE_LENGTH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (embeds) body.embeds = embeds as any[];
    await interaction.editReply(body);
  } catch (error) {
    log.error('Failed to edit deferred response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Respond to an interaction with an ephemeral (only-visible-to-user) message.
 */
export async function respondEphemeral(interaction: RepliableInteraction, content: string): Promise<void> {
  try {
    await interaction.reply({ content: content.slice(0, MAX_MESSAGE_LENGTH), flags: MessageFlags.Ephemeral });
  } catch (error) {
    log.error('Failed to send ephemeral response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function acknowledgeButton(interaction: RepliableInteraction, message: string): Promise<void> {
  try {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  } catch (error) {
    log.error('Failed to acknowledge button', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Send a plain-text message (no embeds) to a Discord channel.
 * Used internally to send URL follow-ups so Discord can auto-unfurl them.
 */
async function sendPlainMessage(_botToken: string, channelId: string, content: string): Promise<void> {
  try {
    const restClient = getRestClient();
    await restClient.sendMessage(channelId, { content });
  } catch (err) {
    log.error('Error sending URL follow-up', { error: String(err) });
  }
}

/**
 * Send a follow-up message with extracted URLs so Discord auto-unfurls them.
 * Discord won't unfurl URLs in `content` when rich embeds are present in the
 * same message, so URLs must be in a separate embed-free message.
 */
async function sendUrlFollowUp(botToken: string, channelId: string, embed: DiscordEmbed): Promise<void> {
  const urls = extractUrlsFromEmbed(embed);
  if (!urls) return;
  await sendPlainMessage(botToken, channelId, urls.join('\n'));
}

export async function sendEmbed(
  delivery: DeliveryTracker,
  botToken: string,
  channelId: string,
  embed: DiscordEmbed,
): Promise<string | null> {
  const urls = extractUrlsFromEmbed(embed);
  const cleanEmbed = prepareOutboundEmbed(embed);
  try {
    const { result } = await delivery.sendWithReceipt('discord', async () => {
      const restClient = getRestClient();
      const msg = await restClient.sendMessage(channelId, {
        embeds: [cleanEmbed],
        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
      });
      return (msg as { id: string }).id;
    });
    if (urls) await sendUrlFollowUp(botToken, channelId, embed);
    return result;
  } catch {
    return null;
  }
}

export async function sendMessageWithEmbed(
  delivery: DeliveryTracker,
  _botToken: string,
  channelId: string,
  content: string | undefined,
  embed: DiscordEmbed,
): Promise<void> {
  try {
    await delivery.sendWithReceipt('discord', async () => {
      const body: Record<string, unknown> = { embeds: [embed] };
      if (content) body.content = content;
      const restClient = getRestClient();
      await restClient.sendMessage(channelId, body);
    });
  } catch {
    // Error already logged by DeliveryTracker
  }
}

export async function sendEmbedWithButtons(
  delivery: DeliveryTracker,
  _botToken: string,
  channelId: string,
  embed: DiscordEmbed,
  components: DiscordActionRow[],
): Promise<void> {
  try {
    await delivery.sendWithReceipt('discord', async () => {
      const restClient = getRestClient();
      await restClient.sendMessage(channelId, { embeds: [embed], components });
    });
  } catch {
    // Error already logged by DeliveryTracker
  }
}

export async function sendReplyEmbed(
  delivery: DeliveryTracker,
  botToken: string,
  channelId: string,
  replyToMessageId: string,
  embed: DiscordEmbed,
): Promise<string | null> {
  assertSnowflake(channelId, 'channel ID');
  assertSnowflake(replyToMessageId, 'message ID');
  const urls = extractUrlsFromEmbed(embed);
  const cleanEmbed = prepareOutboundEmbed(embed);
  try {
    const { result } = await delivery.sendWithReceipt('discord', async () => {
      const restClient = getRestClient();
      const msg = await restClient.sendMessage(channelId, {
        embeds: [cleanEmbed],
        message_reference: { message_id: replyToMessageId },
        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
      });
      return (msg as { id: string }).id;
    });
    if (urls) await sendUrlFollowUp(botToken, channelId, embed);
    return result;
  } catch {
    return null;
  }
}

export function buildActionRow(
  ...buttons: Array<{ label: string; customId: string; style?: number; emoji?: string }>
): DiscordActionRow {
  return {
    type: ComponentType.ACTION_ROW,
    components: buttons.map((b) => ({
      type: ComponentType.BUTTON,
      style: b.style ?? ButtonStyle.SECONDARY,
      label: b.label,
      custom_id: b.customId,
      ...(b.emoji ? { emoji: { name: b.emoji } } : {}),
    })),
  };
}

export async function sendDiscordMessage(
  delivery: DeliveryTracker,
  _botToken: string,
  channelId: string,
  content: string,
): Promise<void> {
  const chunks = splitMessage(content, MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    try {
      await delivery.sendWithReceipt('discord', async () => {
        const restClient = getRestClient();
        await restClient.sendMessage(channelId, { content: chunk });
      });
    } catch {
      // Error already logged by DeliveryTracker
    }
  }
}

export async function sendTypingIndicator(_botToken: string, channelId: string): Promise<void> {
  try {
    const restClient = getRestClient();
    await restClient.sendTypingIndicator(channelId);
  } catch {
    // Best-effort — don't fail on typing indicator errors
  }
}

export async function addReaction(
  _botToken: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  try {
    assertSnowflake(channelId, 'channel ID');
    assertSnowflake(messageId, 'message ID');
    const restClient = getRestClient();
    await restClient.addReaction(channelId, messageId, emoji);
  } catch {
    // Best-effort — don't fail on reaction errors
  }
}

export async function removeReaction(
  _botToken: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  try {
    assertSnowflake(channelId, 'channel ID');
    assertSnowflake(messageId, 'message ID');
    const restClient = getRestClient();
    await restClient.removeReaction(channelId, messageId, emoji);
  } catch {
    // Best-effort
  }
}

/**
 * Convert a hex color string (e.g. '#ff00aa' or 'ff00aa') to a Discord
 * embed color integer.  Returns `null` for invalid input so callers can
 * fall back to the hash-based color.
 */
export function hexColorToInt(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const cleaned = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

/** Generate a consistent color for an agent name. */
export function agentColor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const s = 0.6,
    l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/** Agent identity info for building personalized embed authors. */
export interface AgentIdentity {
  agentName: string;
  displayIcon?: string | null;
  avatarUrl?: string | null;
}

/**
 * Build a Discord embed `author` block from agent identity.
 * Shows the agent's avatar as a small icon next to their name.
 * If displayIcon (emoji) is set, it's prepended to the name.
 */
export function buildAgentAuthor(identity: AgentIdentity): DiscordEmbedAuthor {
  const name = identity.displayIcon ? `${identity.displayIcon} ${identity.agentName}` : identity.agentName;
  return {
    name,
    ...(identity.avatarUrl ? { icon_url: identity.avatarUrl } : {}),
  };
}

export async function editEmbed(
  delivery: DeliveryTracker,
  botToken: string,
  channelId: string,
  messageId: string,
  embed: DiscordEmbed,
): Promise<void> {
  assertSnowflake(channelId, 'channel ID');
  assertSnowflake(messageId, 'message ID');
  const urls = extractUrlsFromEmbed(embed);
  const cleanEmbed = prepareOutboundEmbed(embed);
  try {
    await delivery.sendWithReceipt('discord', async () => {
      const restClient = getRestClient();
      await restClient.editMessage(channelId, messageId, {
        embeds: [cleanEmbed],
        ...(extractContentFromEmbed(embed) ? { content: extractContentFromEmbed(embed) } : {}),
      });
    });
    if (urls) await sendUrlFollowUp(botToken, channelId, embed);
  } catch {
    // Error already logged by DeliveryTracker
  }
}

// ── File attachment support ──────────────────────────────────────────

/** A file to attach to an outbound Discord message. */
export interface DiscordFileAttachment {
  /** Filename shown in Discord (e.g. "chart.png"). */
  name: string;
  /** Raw file contents. */
  data: Uint8Array | Buffer;
  /** MIME type (defaults to "application/octet-stream"). */
  contentType?: string;
}

/** Discord bot file size limit (25 MB). */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Send an embed with file attachments.
 * Files can be referenced in the embed via `attachment://filename.png` in image/thumbnail URLs.
 */
export async function sendEmbedWithFiles(
  delivery: DeliveryTracker,
  botToken: string,
  channelId: string,
  embed: DiscordEmbed,
  files: DiscordFileAttachment[],
): Promise<string | null> {
  for (const f of files) {
    if (f.data.byteLength > MAX_FILE_SIZE_BYTES) {
      log.error('File too large for Discord upload', { name: f.name, size: f.data.byteLength });
      return null;
    }
  }

  const urls = extractUrlsFromEmbed(embed);
  const cleanEmbed = prepareOutboundEmbed(embed);

  try {
    const { result } = await delivery.sendWithReceipt('discord', async () => {
      const payload: Record<string, unknown> = {
        embeds: [cleanEmbed],
        attachments: files.map((f, i) => ({ id: i, filename: f.name })),
      };
      const extracted = extractContentFromEmbed(embed);
      if (extracted) payload.content = extracted;

      const restClient = getRestClient();
      const msg = await restClient.sendMessageWithFiles(channelId, payload, files);
      return (msg as { id: string }).id;
    });
    if (urls) await sendUrlFollowUp(botToken, channelId, embed);
    return result;
  } catch {
    return null;
  }
}

/**
 * Send a plain-text message with file attachments.
 */
export async function sendMessageWithFiles(
  delivery: DeliveryTracker,
  _botToken: string,
  channelId: string,
  content: string,
  files: DiscordFileAttachment[],
): Promise<string | null> {
  for (const f of files) {
    if (f.data.byteLength > MAX_FILE_SIZE_BYTES) {
      log.error('File too large for Discord upload', { name: f.name, size: f.data.byteLength });
      return null;
    }
  }

  try {
    const { result } = await delivery.sendWithReceipt('discord', async () => {
      const payload: Record<string, unknown> = {
        content: content.slice(0, MAX_MESSAGE_LENGTH),
        attachments: files.map((f, i) => ({ id: i, filename: f.name })),
      };

      const restClient = getRestClient();
      const msg = await restClient.sendMessageWithFiles(channelId, payload, files);
      return (msg as { id: string }).id;
    });
    return result;
  } catch {
    return null;
  }
}

/** Re-export splitEmbedDescription and collapseCodeBlocks for use by other modules. */
export { collapseCodeBlocks, splitEmbedDescription } from './message-formatter';

export { CorvidEmbed, EMBED_BUTTONS, EMBED_COLORS, type EmbedAgentIdentity, type EmbedButtonKey } from './embed-builder';
