/**
 * Production-safe logger utility.
 *
 * In development: all levels are logged to stderr (like console.error).
 * In production: only 'error' and 'warn' are logged; 'log'/'debug' are suppressed.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('Failed to create invoice', err);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogArgs {
  message: string;
  data?: unknown;
  error?: unknown;
}

const isDev = process.env.NODE_ENV !== 'production';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum level: 'debug' in dev, 'warn' in production
const minLevel: LogLevel = isDev ? 'debug' : 'warn';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatArgs(args: LogArgs): string {
  const parts = [args.message];
  if (args.data !== undefined) {
    try {
      parts.push(JSON.stringify(args.data));
    } catch {
      parts.push(String(args.data));
    }
  }
  if (args.error instanceof Error) {
    parts.push(`[${args.error.name}: ${args.error.message}]`);
    if (isDev && args.error.stack) {
      parts.push(args.error.stack);
    }
  } else if (args.error !== undefined) {
    parts.push(String(args.error));
  }
  return parts.join(' ');
}

function emit(level: LogLevel, args: LogArgs): void {
  if (!shouldLog(level)) return;
  const output = formatArgs(args);
  // Always use stderr to avoid interfering with stdout-based responses
  process.stderr.write(`${level.toUpperCase()}: ${output}\n`);
}

export const logger = {
  debug(message: string, data?: unknown) {
    emit('debug', { message, data });
  },
  info(message: string, data?: unknown) {
    emit('info', { message, data });
  },
  warn(message: string, data?: unknown) {
    emit('warn', { message, data });
  },
  error(message: string, error?: unknown) {
    emit('error', { message, error });
  },
};
