import crypto from 'node:crypto';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'token_hash',
  'csrfToken',
  'csrf_token',
  'sessionSecret',
  'paymentHashSecret',
  'mfaSecret',
  'mfa_secret',
  'cardNumber',
  'cvv',
  'authorization',
  'cookie',
  'smtpApiKey',
]);

export function redactSensitiveData(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item));
  }
  const output: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k) || /password|secret|token|cookie|cvv|card_number/i.test(k)) {
      output[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      output[k] = redactSensitiveData(v);
    } else {
      output[k] = v;
    }
  }
  return output;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
}

const recentErrorLogs: LogEntry[] = [];
const MAX_RECENT_LOGS = 200;

export function writeLog(
  level: LogLevel,
  event: string,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string
): LogEntry {
  const safeContext = context ? (redactSensitiveData(context) as Record<string, unknown>) : undefined;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: requestId || crypto.randomUUID().slice(0, 8),
    event,
    message,
    ...(safeContext ? { context: safeContext } : {}),
  };

  if (level === 'ERROR' || level === 'WARN') {
    recentErrorLogs.unshift(entry);
    if (recentErrorLogs.length > MAX_RECENT_LOGS) {
      recentErrorLogs.pop();
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    const line = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return entry;
}

export const logger = {
  info: (event: string, message: string, context?: Record<string, unknown>, requestId?: string) =>
    writeLog('INFO', event, message, context, requestId),
  warn: (event: string, message: string, context?: Record<string, unknown>, requestId?: string) =>
    writeLog('WARN', event, message, context, requestId),
  error: (event: string, message: string, context?: Record<string, unknown>, requestId?: string) =>
    writeLog('ERROR', event, message, context, requestId),
  getRecentAlerts: (limit = 50): LogEntry[] => recentErrorLogs.slice(0, limit),
};
