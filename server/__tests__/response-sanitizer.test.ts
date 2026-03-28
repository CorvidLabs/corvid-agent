import { describe, it, expect } from 'bun:test';
import { sanitizeModelOutput } from '../providers/ollama/response-sanitizer';

describe('sanitizeModelOutput', () => {
    it('strips <think>...</think> blocks', () => {
        const input = '<think>internal reasoning here</think>The actual response.';
        expect(sanitizeModelOutput(input)).toBe('The actual response.');
    });

    it('strips orphaned </think> prefix', () => {
        const input = '</think>The actual response.';
        expect(sanitizeModelOutput(input)).toBe('The actual response.');
    });

    it('strips unclosed <think> at end', () => {
        const input = 'Response start.\n<think>still thinking...';
        expect(sanitizeModelOutput(input)).toBe('Response start.');
    });

    it('strips [Context Summary] lines', () => {
        const input = '[Context Summary] Original request: something\nActual response here.';
        expect(sanitizeModelOutput(input)).toBe('Actual response here.');
    });

    it('strips repeated [Context Summary] chains', () => {
        const input = '[Context Summary] Original request: [Context Summary] Original request: [Context Summary] Original request: response';
        const result = sanitizeModelOutput(input);
        expect(result).not.toContain('[Context Summary]');
    });

    it('strips <system-reminder> blocks', () => {
        const input = 'Hello.<system-reminder>secret stuff</system-reminder> Goodbye.';
        expect(sanitizeModelOutput(input)).toBe('Hello.Goodbye.');
    });

    it('strips agent metadata lines', () => {
        const input = 'Condor · nemotron-3-super:cloud · sandbox · sid:580650f9\nActual content.';
        expect(sanitizeModelOutput(input)).toBe('Actual content.');
    });

    it('strips channel instruction blocks', () => {
        const input = '[This message came from Discord. Reply directly in this conversation.] Hello!';
        expect(sanitizeModelOutput(input)).toBe('Hello!');
    });

    it('leaves clean content untouched', () => {
        const input = 'This is a perfectly normal response with no artifacts.';
        expect(sanitizeModelOutput(input)).toBe(input);
    });

    it('handles empty content', () => {
        expect(sanitizeModelOutput('')).toBe('');
    });

    it('collapses excessive blank lines after stripping', () => {
        const input = 'Line 1.\n\n\n<think>removed</think>\n\n\nLine 2.';
        const result = sanitizeModelOutput(input);
        expect(result).not.toMatch(/\n{3,}/);
        expect(result).toContain('Line 1.');
        expect(result).toContain('Line 2.');
    });

    it('handles the real Condor leak pattern', () => {
        const input = `Based on the directory listing, I can see the project structure includes:
client/ (Angular frontend)
server/ (API routes, WebSocket, process management)

</think>[Context Summary] Original request: [Context Summary] Original request: [Context Summary] Original request: [This message came from Discord. Reply directly in this conversation — do NOT use corvid_send_message or other cross-cha...
Tools used: 2 tool calls executed.
Last assistant response:
Follow-up messages: Do not ask what to do — take action now. Use the tools available to you. Start by reading relevant f...
Condor · nemotron-3-super:cloud · sandbox · sid:580650f9

IMPORTANT: After completing your current task, you MUST address the user's message above. Do not ignore it.`;
        const result = sanitizeModelOutput(input);
        // Should strip most of the leaked content
        expect(result).not.toContain('[Context Summary]');
        expect(result).not.toContain('</think>');
        expect(result).not.toContain('system-reminder');
        expect(result).not.toContain('Tools used:');
        expect(result).not.toContain('sid:580650f9');
    });
});
