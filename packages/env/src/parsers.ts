/**
 * Type parser functions for environment variables.
 * Each parser takes a raw string value and returns the parsed type,
 * or throws with a descriptive error message.
 */

export function parseString(value: string, key: string): string {
  return value;
}

export function parseNumber(value: string, key: string): number {
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new EnvParseError(
      `Environment variable "${key}" must be a valid number, got "${value}"`
    );
  }
  return parsed;
}

export function parseBoolean(value: string, key: string): boolean {
  const lower = value.toLowerCase().trim();
  const truthy = ['true', '1', 'yes', 'on'];
  const falsy = ['false', '0', 'no', 'off'];

  if (truthy.includes(lower)) return true;
  if (falsy.includes(lower)) return false;

  throw new EnvParseError(
    `Environment variable "${key}" must be a boolean value (true/false/1/0/yes/no/on/off), got "${value}"`
  );
}

export function parseJson<T = unknown>(value: string, key: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new EnvParseError(
      `Environment variable "${key}" must be valid JSON, got "${value}"`
    );
  }
}

/**
 * Custom error class for environment variable parsing errors.
 */
export class EnvParseError extends Error {
  public readonly key?: string;

  constructor(message: string, key?: string) {
    super(message);
    this.name = 'EnvParseError';
    this.key = key;
  }
}

/**
 * Error thrown when a required environment variable is missing.
 */
export class EnvMissingError extends Error {
  public readonly key: string;

  constructor(key: string) {
    super(`Missing required environment variable: "${key}"`);
    this.name = 'EnvMissingError';
    this.key = key;
  }
}

/**
 * Error thrown when environment variable validation fails.
 */
export class EnvValidationError extends Error {
  public readonly key: string;

  constructor(key: string, message?: string) {
    const msg = message
      ? `Validation failed for environment variable "${key}": ${message}`
      : `Validation failed for environment variable "${key}"`;
    super(msg);
    this.name = 'EnvValidationError';
    this.key = key;
  }
}

/**
 * Aggregate error thrown by env.parse() when multiple variables fail.
 */
export class EnvSchemaError extends Error {
  public readonly errors: Error[];

  constructor(errors: Error[]) {
    const messages = errors.map((e) => `  - ${e.message}`).join('\n');
    super(`Environment validation failed:\n${messages}`);
    this.name = 'EnvSchemaError';
    this.errors = errors;
  }
}
