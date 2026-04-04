/**
 * Discord REST client wrapper using discord.js @discordjs/rest.
 * Encapsulates rate limit handling and provides a thin adapter to the discord.js REST client.
 */

import { REST, Routes, type APIMessage, type APIInteractionResponse } from 'discord.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('DiscordRestClient');

interface RestClientOptions {
	token: string;
}

/**
 * Wrapper around discord.js REST client that provides rate limit handling
 * and maintains compatibility with the existing embeds.ts API.
 */
export class DiscordRestClient {
	private rest: REST;

	constructor(options: RestClientOptions) {
		this.rest = new REST({ version: '10' }).setToken(options.token);
	}

	/**
	 * Respond to a Discord interaction (slash command, button, etc).
	 * Used for initial responses within the 3-second deadline.
	 */
	async respondToInteraction(
		interactionId: string,
		interactionToken: string,
		data: { type: number; data: Record<string, unknown> },
	): Promise<APIInteractionResponse> {
		try {
			const result = await this.rest.post(
				Routes.interactionCallback(interactionId, interactionToken),
				{ body: data },
			);
			return result as APIInteractionResponse;
		} catch (error) {
			log.error('Failed to respond to Discord interaction', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Defer an interaction response (for long-running operations).
	 */
	async deferInteraction(
		interactionId: string,
		interactionToken: string,
		ephemeral = false,
	): Promise<void> {
		try {
			await this.rest.post(Routes.interactionCallback(interactionId, interactionToken), {
				body: {
					type: 5, // DEFERRED_CHANNEL_MESSAGE
					data: ephemeral ? { flags: 64 } : {},
				},
			});
		} catch (error) {
			log.error('Failed to defer Discord interaction', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Edit a deferred interaction response.
	 */
	async editDeferredResponse(
		applicationId: string,
		interactionToken: string,
		data: Record<string, unknown>,
	): Promise<APIMessage> {
		try {
			const result = await this.rest.patch(
				Routes.webhookMessage(applicationId, interactionToken, '@original'),
				{ body: data },
			);
			return result as APIMessage;
		} catch (error) {
			log.error('Failed to edit deferred response', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Send a message to a channel.
	 */
	async sendMessage(
		channelId: string,
		data: Record<string, unknown>,
	): Promise<APIMessage> {
		try {
			const result = await this.rest.post(Routes.channelMessages(channelId), {
				body: data,
			});
			return result as APIMessage;
		} catch (error) {
			log.error('Failed to send Discord message', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Edit an existing message.
	 */
	async editMessage(
		channelId: string,
		messageId: string,
		data: Record<string, unknown>,
	): Promise<APIMessage> {
		try {
			const result = await this.rest.patch(
				Routes.channelMessage(channelId, messageId),
				{ body: data },
			);
			return result as APIMessage;
		} catch (error) {
			log.error('Failed to edit Discord message', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Delete a message.
	 */
	async deleteMessage(channelId: string, messageId: string): Promise<void> {
		try {
			await this.rest.delete(Routes.channelMessage(channelId, messageId));
		} catch (error) {
			log.error('Failed to delete Discord message', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Add a reaction to a message.
	 */
	async addReaction(
		channelId: string,
		messageId: string,
		emoji: string,
	): Promise<void> {
		try {
			await this.rest.put(
				Routes.channelMessageOwnReaction(channelId, messageId, emoji),
			);
		} catch (error) {
			log.error('Failed to add Discord reaction', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	/**
	 * Trigger typing indicator in a channel.
	 */
	async sendTypingIndicator(channelId: string): Promise<void> {
		try {
			await this.rest.post(Routes.channelTyping(channelId));
		} catch (error) {
			log.error('Failed to send typing indicator', {
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}
}

/**
 * Global REST client instance (initialized from bot token).
 * This is the singleton used by embeds.ts and other modules.
 */
let restClient: DiscordRestClient | null = null;

export function initializeRestClient(token: string): void {
	restClient = new DiscordRestClient({ token });
}

export function getRestClient(): DiscordRestClient {
	if (!restClient) {
		throw new Error('REST client not initialized. Call initializeRestClient() first.');
	}
	return restClient;
}

/** @internal Test-only: inject a mock client (pass `null` to reset). */
export function _setRestClientForTesting(client: DiscordRestClient | null): void {
	restClient = client;
}
