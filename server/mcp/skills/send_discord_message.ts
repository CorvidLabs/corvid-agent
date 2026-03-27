/**
 * Discord Message Tool
 * 
 * Sends a message to a Discord channel via webhook.
 * Usage: Send notifications, alerts, or status updates to Discord servers.
 */

import { defineSkill, z } from '../skill-base';

export default defineSkill({
  name: 'send_discord_message',
  description: 'Send a message to a Discord channel using a webhook URL',
  parameters: z.object({
    webhook_url: z.string().url().describe('Discord webhook URL'),
    content: z.string().max(2000).describe('Message content to send'),
    username: z.string().optional().describe('Optional custom username to display'),
    avatar_url: z.string().url().optional().describe('Optional custom avatar URL'),
  }),
  
  async execute({ webhook_url, content, username, avatar_url }) {
    try {
      const payload: any = { content };
      if (username) payload.username = username;
      if (avatar_url) payload.avatar_url = avatar_url;
      
      const response = await fetch(webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} - ${error}`);
      }
      
      return {
        success: true,
        message: 'Message sent successfully to Discord',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send Discord message',
      };
    }
  },
});
