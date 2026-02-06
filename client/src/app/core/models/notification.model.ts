export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
    id: string;
    type: NotificationType;
    message: string;
    /** Optional longer description shown below the message */
    detail?: string;
    /** Auto-dismiss timeout in ms. `0` means persistent (manual dismiss only). */
    duration: number;
    /** Timestamp for ordering */
    createdAt: number;
}
