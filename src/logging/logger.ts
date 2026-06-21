export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogData = Record<string, unknown>;

export interface ILogger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  child(context: LogData): ILogger;
}

export class StructuredLogger implements ILogger {
  constructor(private readonly context: LogData = {}) {}

  debug(message: string, data?: LogData): void {
    this.write("debug", message, data);
  }

  info(message: string, data?: LogData): void {
    this.write("info", message, data);
  }

  warn(message: string, data?: LogData): void {
    this.write("warn", message, data);
  }

  error(message: string, data?: LogData): void {
    this.write("error", message, data);
  }

  child(context: LogData): ILogger {
    return new StructuredLogger({
      ...this.context,
      ...context
    });
  }

  private write(level: LogLevel, message: string, data?: LogData): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...this.normalize(data)
    };

    const line = `${JSON.stringify(entry)}\n`;
    if (level === "error" || level === "warn") {
      process.stderr.write(line);
      return;
    }

    process.stdout.write(line);
  }

  private normalize(data?: LogData): LogData {
    if (!data) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, this.normalizeValue(value)])
    );
  }

  private normalizeValue(value: unknown): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }

    return value;
  }
}

export class NullLogger implements ILogger {
  debug(_message: string, _data?: LogData): void {}
  info(_message: string, _data?: LogData): void {}
  warn(_message: string, _data?: LogData): void {}
  error(_message: string, _data?: LogData): void {}

  child(_context: LogData): ILogger {
    return this;
  }
}

export const logger = new StructuredLogger({
  service: "voxist"
});
