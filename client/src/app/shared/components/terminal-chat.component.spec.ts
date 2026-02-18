import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import {
    TerminalChatComponent,
    TerminalMessage,
    ToolEvent,
} from './terminal-chat.component';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';

/**
 * Test host component that wraps TerminalChatComponent,
 * allowing us to set inputs and capture outputs.
 */
@Component({
    selector: 'app-test-host',
    template: `
        <app-terminal-chat
            [messages]="messages()"
            [toolEvents]="toolEvents()"
            [thinking]="thinking()"
            [streamBuffer]="streamBuffer()"
            [streamDone]="streamDone()"
            [inputDisabled]="inputDisabled()"
            (messageSent)="onMessageSent($event)"
        />
    `,
    imports: [TerminalChatComponent],
})
class TestHostComponent {
    readonly messages = signal<TerminalMessage[]>([]);
    readonly toolEvents = signal<ToolEvent[]>([]);
    readonly thinking = signal(false);
    readonly streamBuffer = signal('');
    readonly streamDone = signal(false);
    readonly inputDisabled = signal(false);

    lastMessageSent: string | null = null;
    onMessageSent(msg: string): void {
        this.lastMessageSent = msg;
    }
}

/** Creates a mock TerminalMessage. */
function createMessage(overrides: Partial<TerminalMessage> = {}): TerminalMessage {
    return {
        content: 'Hello world',
        direction: 'inbound',
        timestamp: new Date(),
        ...overrides,
    };
}

/** Creates a mock ToolEvent. */
function createToolEvent(overrides: Partial<ToolEvent> = {}): ToolEvent {
    return {
        toolName: 'Bash',
        input: 'ls -la',
        timestamp: new Date(),
        ...overrides,
    };
}

describe('TerminalChatComponent', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let host: TestHostComponent;
    let hostEl: HTMLElement;

    function createComponent(): ComponentFixture<TestHostComponent> {
        fixture = TestBed.createComponent(TestHostComponent);
        host = fixture.componentInstance;
        fixture.detectChanges();
        hostEl = fixture.nativeElement as HTMLElement;
        return fixture;
    }

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [TestHostComponent, TerminalChatComponent],
        });
    });

    afterEach(() => {
        fixture.destroy();
    });

    // ──────────────────────────────────────────────
    // Empty state
    // ──────────────────────────────────────────────
    it('should show empty state when no messages', () => {
        createComponent();
        const empty = hostEl.querySelector('.terminal__empty');
        expect(empty).toBeTruthy();
        expect(empty!.textContent).toContain('No messages yet');
    });

    it('should not show empty state when messages exist', () => {
        createComponent();
        host.messages.set([createMessage()]);
        fixture.detectChanges();

        const empty = hostEl.querySelector('.terminal__empty');
        expect(empty).toBeNull();
    });

    // ──────────────────────────────────────────────
    // Rendering messages
    // ──────────────────────────────────────────────
    it('should render inbound messages with correct prompt', () => {
        createComponent();
        host.messages.set([
            createMessage({ content: 'User message', direction: 'inbound' }),
        ]);
        fixture.detectChanges();

        const lines = hostEl.querySelectorAll('.terminal__line');
        expect(lines).toHaveLength(1);

        const line = lines[0];
        expect(line.classList.contains('terminal__line--inbound')).toBe(true);

        const prompt = line.querySelector('.terminal__prompt');
        expect(prompt).toBeTruthy();
        expect(prompt!.textContent).toContain('>');
    });

    it('should render outbound messages with assistant prompt', () => {
        createComponent();
        host.messages.set([
            createMessage({ content: 'Assistant response', direction: 'outbound' }),
        ]);
        fixture.detectChanges();

        const line = hostEl.querySelector('.terminal__line--outbound');
        expect(line).toBeTruthy();

        const prompt = line!.querySelector('.terminal__prompt');
        expect(prompt!.textContent).toContain('assistant>');
    });

    it('should render multiple messages', () => {
        createComponent();
        host.messages.set([
            createMessage({ content: 'First', direction: 'inbound', timestamp: new Date(1000) }),
            createMessage({ content: 'Second', direction: 'outbound', timestamp: new Date(2000) }),
            createMessage({ content: 'Third', direction: 'status', timestamp: new Date(3000) }),
        ]);
        fixture.detectChanges();

        const lines = hostEl.querySelectorAll('.terminal__line');
        expect(lines).toHaveLength(3);
    });

    // ──────────────────────────────────────────────
    // Tool events
    // ──────────────────────────────────────────────
    it('should render tool events', () => {
        createComponent();
        host.toolEvents.set([
            createToolEvent({ toolName: 'Bash', input: 'ls -la' }),
            createToolEvent({ toolName: 'Read', input: '/tmp/file.txt', timestamp: new Date(2000) }),
        ]);
        fixture.detectChanges();

        const tools = hostEl.querySelectorAll('.terminal__tool');
        expect(tools).toHaveLength(2);

        const firstSummary = tools[0].querySelector('.terminal__tool-name');
        expect(firstSummary).toBeTruthy();
        expect(firstSummary!.textContent).toContain('Bash');
    });

    // ──────────────────────────────────────────────
    // Thinking indicator
    // ──────────────────────────────────────────────
    it('should show thinking indicator when thinking is true', () => {
        createComponent();
        host.thinking.set(true);
        fixture.detectChanges();

        const thinking = hostEl.querySelector('.terminal__thinking');
        expect(thinking).toBeTruthy();
        expect(thinking!.textContent).toContain('thinking...');
    });

    it('should hide thinking indicator when thinking is false', () => {
        createComponent();
        host.thinking.set(false);
        fixture.detectChanges();

        const thinking = hostEl.querySelector('.terminal__thinking');
        expect(thinking).toBeNull();
    });

    // ──────────────────────────────────────────────
    // Input area
    // ──────────────────────────────────────────────
    it('should render input textarea', () => {
        createComponent();
        const textarea = hostEl.querySelector<HTMLTextAreaElement>('.terminal__input');
        expect(textarea).toBeTruthy();
    });

    it('should disable textarea when inputDisabled is true', () => {
        createComponent();
        host.inputDisabled.set(true);
        fixture.detectChanges();

        const textarea = hostEl.querySelector<HTMLTextAreaElement>('.terminal__input');
        expect(textarea).toBeTruthy();
        expect(textarea!.disabled).toBe(true);
    });

    // ──────────────────────────────────────────────
    // Stream buffer
    // ──────────────────────────────────────────────
    it('should render stream buffer content when present', () => {
        createComponent();
        host.streamBuffer.set('Streaming text...');
        fixture.detectChanges();

        const streaming = hostEl.querySelector('.terminal__line--streaming');
        expect(streaming).toBeTruthy();
        expect(streaming!.textContent).toContain('Streaming text...');
    });

    it('should show cursor when streaming and not done', () => {
        createComponent();
        host.streamBuffer.set('Partial...');
        host.streamDone.set(false);
        fixture.detectChanges();

        const cursor = hostEl.querySelector('.terminal__cursor');
        expect(cursor).toBeTruthy();
    });

    it('should hide cursor when stream is done', () => {
        createComponent();
        host.streamBuffer.set('Complete response');
        host.streamDone.set(true);
        fixture.detectChanges();

        const cursor = hostEl.querySelector('.terminal__cursor');
        expect(cursor).toBeNull();
    });
});
