/**
 * Logger utility for mesh networking components
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level: LogLevel;
  context?: string;
  enableConsole: boolean;
  enableFile?: boolean;
  filePath?: string;
  enableRemote?: boolean;
  remoteEndpoint?: string;
}

export class Logger {
  private config: LoggerConfig;
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 1000;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  static create(context: string, level: LogLevel = 'info'): Logger {
    return new Logger({
      level,
      context,
      enableConsole: true,
      enableFile: false
    });
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const configLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, metadata?: any): string {
    const timestamp = new Date().toISOString();
    const context = this.config.context ? `[${this.config.context}] ` : '';
    const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    return `${timestamp} ${level.toUpperCase()} ${context}${message}${metaStr}`;
  }

  private log(level: LogLevel, message: string, metadata?: any): void {
    if (!this.shouldLog(level)) return;

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.config.context,
      metadata
    };

    // Add to history
    this.logHistory.push(logEntry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      const formatted = this.formatMessage(level, message, metadata);

      switch (level) {
        case 'debug':
          console.debug(formatted);
          break;
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'error':
          console.error(formatted);
          break;
      }
    }

    // File output
    if (this.config.enableFile && this.config.filePath) {
      this.writeToFile(logEntry);
    }

    // Remote output
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.sendToRemote(logEntry);
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const formatted = this.formatMessage(entry.level, entry.message, entry.metadata);
      await fs.appendFile(this.config.filePath!, formatted + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private async sendToRemote(entry: LogEntry): Promise<void> {
    try {
      await fetch(this.config.remoteEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.error('Failed to send log to remote endpoint:', error);
    }
  }

  debug(message: string, metadata?: any): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: any): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: any): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: any): void {
    this.log('error', message, metadata);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getHistory(limit?: number): LogEntry[] {
    const history = [...this.logHistory];
    return limit ? history.slice(-limit) : history;
  }

  clear(): void {
    this.logHistory = [];
  }

  getStats(): {
    totalEntries: number;
    byLevel: Record<LogLevel, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const byLevel = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    };

    for (const entry of this.logHistory) {
      byLevel[entry.level]++;
    }

    return {
      totalEntries: this.logHistory.length,
      byLevel,
      oldestEntry: this.logHistory[0]?.timestamp,
      newestEntry: this.logHistory[this.logHistory.length - 1]?.timestamp
    };
  }

  child(context: string): Logger {
    const childContext = this.config.context
      ? `${this.config.context}:${context}`
      : context;

    return new Logger({
      ...this.config,
      context: childContext
    });
  }
}

// Global logger instances for mesh components
export const MeshLogger = Logger.create('Mesh');
export const NetworkLogger = Logger.create('Network');
export const ChannelLogger = Logger.create('Channel');
export const NodeLogger = Logger.create('Node');

// Utility function to create component-specific loggers
export function createLogger(component: string, level?: LogLevel): Logger {
  return Logger.create(component, level);
}