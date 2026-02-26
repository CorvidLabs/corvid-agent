import { TestBed } from '@angular/core/testing';
import { WebSocketService } from './websocket.service';
import { NotificationService } from './notification.service';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

/**
 * Minimal mock WebSocket that captures constructor args and
 * exposes lifecycle callbacks for the test harness to trigger.
 */
class MockWebSocket {
    static instances: MockWebSocket[] = [];

    url: string;
    readyState = 0; // CONNECTING
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;

    send = vi.fn();
    close = vi.fn(() => {
        this.readyState = 3; // CLOSED
        this.onclose?.();
    });

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    /** Simulate a successful connection. */
    simulateOpen(): void {
        this.readyState = 1; // OPEN
        this.onopen?.();
    }

    /** Simulate an incoming message. */
    simulateMessage(data: unknown): void {
        this.onmessage?.({ data: JSON.stringify(data) });
    }

    /** Simulate a connection close without going through close(). */
    simulateClose(): void {
        this.readyState = 3;
        this.onclose?.();
    }

    /** Simulate a WebSocket error. */
    simulateError(): void {
        this.onerror?.();
    }
}

describe('WebSocketService', () => {
    let service: WebSocketService;
    let notificationService: NotificationService;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: false });
        MockWebSocket.instances = [];

        // Install mock WebSocket globally
        (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
        // Provide the OPEN constant used in the service for readyState checks
        (MockWebSocket as unknown as { OPEN: number }).OPEN = 1;

        TestBed.configureTestingModule({});
        service = TestBed.inject(WebSocketService);
        notificationService = TestBed.inject(NotificationService);
    });

    afterEach(() => {
        service.disconnect();
        vi.useRealTimers();
    });

    /** Helper: connect and simulate open. */
    function connectAndOpen(): MockWebSocket {
        service.connect();
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws.simulateOpen();
        return ws;
    }

    // ──────────────────────────────────────────────
    // Initial state
    // ──────────────────────────────────────────────
    it('should start with connected signal as false', () => {
        expect(service.connected()).toBe(false);
    });

    it('should have connectionStatus as disconnected initially', () => {
        expect(service.connectionStatus()).toBe('disconnected');
    });

    // ──────────────────────────────────────────────
    // connect()
    // ──────────────────────────────────────────────
    it('should create a WebSocket on connect', () => {
        service.connect();
        expect(MockWebSocket.instances).toHaveLength(1);
        expect(MockWebSocket.instances[0].url).toContain('/ws');
    });

    it('should set connected to true on open', () => {
        connectAndOpen();
        expect(service.connected()).toBe(true);
        expect(service.connectionStatus()).toBe('connected');
    });

    it('should not create a duplicate WebSocket if already open', () => {
        connectAndOpen();
        // Second call while open should be a no-op
        service.connect();
        expect(MockWebSocket.instances).toHaveLength(1);
    });

    // ──────────────────────────────────────────────
    // disconnect()
    // ──────────────────────────────────────────────
    it('should close the WebSocket on disconnect', () => {
        const ws = connectAndOpen();
        service.disconnect();

        expect(ws.close).toHaveBeenCalled();
        expect(service.connected()).toBe(false);
    });

    // ──────────────────────────────────────────────
    // sendMessage()
    // ──────────────────────────────────────────────
    it('should call ws.send with JSON when sendMessage is called', () => {
        const ws = connectAndOpen();
        service.sendMessage('sess-1', 'hello world');

        expect(ws.send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'send_message', sessionId: 'sess-1', content: 'hello world' }),
        );
    });

    it('should not send if WebSocket is not open', () => {
        service.connect();
        // Do NOT simulate open — readyState is still CONNECTING (0)
        const ws = MockWebSocket.instances[0];
        service.sendMessage('sess-1', 'hello');
        expect(ws.send).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────
    // Message routing
    // ──────────────────────────────────────────────
    it('should route parsed messages to registered handlers', () => {
        const ws = connectAndOpen();
        const handler = vi.fn();
        service.onMessage(handler);

        ws.simulateMessage({ type: 'session_status', sessionId: 's1', status: 'running' });

        expect(handler).toHaveBeenCalledWith({
            type: 'session_status',
            sessionId: 's1',
            status: 'running',
        });
    });

    it('should call notification.error for error type messages', () => {
        const ws = connectAndOpen();
        const errorSpy = vi.spyOn(notificationService, 'error');

        ws.simulateMessage({ type: 'error', message: 'Something went wrong' });

        expect(errorSpy).toHaveBeenCalledWith('Something went wrong');
    });

    it('should ignore malformed JSON messages without throwing', () => {
        const ws = connectAndOpen();
        // Directly call onmessage with invalid JSON
        expect(() => {
            ws.onmessage?.({ data: 'not valid json{{{' });
        }).not.toThrow();
    });

    // ──────────────────────────────────────────────
    // Handler unsubscribe
    // ──────────────────────────────────────────────
    it('should remove handler when unsubscribe function is called', () => {
        const ws = connectAndOpen();
        const handler = vi.fn();
        const unsubscribe = service.onMessage(handler);

        unsubscribe();
        ws.simulateMessage({ type: 'session_status', sessionId: 's1', status: 'done' });

        expect(handler).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────
    // Reconnection
    // ──────────────────────────────────────────────
    it('should schedule reconnect on close', () => {
        const ws = connectAndOpen();
        ws.simulateClose();

        expect(service.connected()).toBe(false);

        // Advance past the 3s reconnect delay
        vi.advanceTimersByTime(3000);

        // A new WebSocket should have been created
        expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    });

    it('should cancel pending reconnect on disconnect', () => {
        const ws = connectAndOpen();
        ws.simulateClose();

        // Disconnect should clear the reconnect timer
        service.disconnect();

        vi.advanceTimersByTime(5000);

        // Only the original + the one from close that disconnect cleared
        // disconnect() does not create new connections
        const instancesBeforeDisconnect = MockWebSocket.instances.length;
        vi.advanceTimersByTime(10000);
        expect(MockWebSocket.instances.length).toBe(instancesBeforeDisconnect);
    });

    // ──────────────────────────────────────────────
    // subscribe / unsubscribe sessions
    // ──────────────────────────────────────────────
    it('should re-subscribe to tracked sessions on reconnect', () => {
        const ws1 = connectAndOpen();
        service.subscribe('sess-abc');

        // First subscribe call
        expect(ws1.send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'subscribe', sessionId: 'sess-abc' }),
        );

        // Simulate disconnect and reconnect
        ws1.simulateClose();
        vi.advanceTimersByTime(3000);

        const ws2 = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws2.simulateOpen();

        // Should re-subscribe on the new WebSocket
        expect(ws2.send).toHaveBeenCalledWith(
            JSON.stringify({ type: 'subscribe', sessionId: 'sess-abc' }),
        );
    });
});
