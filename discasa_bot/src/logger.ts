type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, metadata?: unknown): void {
  const line = `[Discasa bot] ${message}`;

  if (level === "error") {
    console.error(line, metadata ?? "");
    return;
  }

  if (level === "warn") {
    console.warn(line, metadata ?? "");
    return;
  }

  console.log(line, metadata ?? "");
}

export const logger = {
  info(message: string, metadata?: unknown): void {
    write("info", message, metadata);
  },
  warn(message: string, metadata?: unknown): void {
    write("warn", message, metadata);
  },
  error(message: string, metadata?: unknown): void {
    write("error", message, metadata);
  },
};
