/**
 * @corvid-agent/env - Type-safe environment variable parser for TypeScript/Node.js
 *
 * Features:
 * - Type-safe parsing: string, number, boolean, JSON
 * - Required/default chaining
 * - Custom validation
 * - Schema-based parsing
 * - Optional dotenv integration
 */

export {
  EnvParseError,
  EnvMissingError,
  EnvValidationError,
  EnvSchemaError,
} from './parsers.js';

import {
  parseString,
  parseNumber,
  parseBoolean,
  parseJson,
  EnvMissingError,
  EnvValidationError,
  EnvSchemaError,
} from './parsers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Parser<T> = (value: string, key: string) => T;
type Validator<T> = (value: T) => boolean | string;

/**
 * Options for loading .env files.
 */
export interface LoadOptions {
  /** Path to the .env file (default: ".env") */
  path?: string;
  /** Override existing environment variables */
  override?: boolean;
}

// ---------------------------------------------------------------------------
// EnvVar builder — fluent API for a single variable
// ---------------------------------------------------------------------------

/**
 * Builder for a single environment variable with fluent chaining.
 */
export class EnvVar<T> {
  private readonly _key: string;
  private readonly _parser: Parser<T>;
  private _required = true;
  private _defaultValue: T | undefined = undefined;
  private _hasDefault = false;
  private _validators: Validator<T>[] = [];
  private _source: Record<string, string | undefined>;

  constructor(
    key: string,
    parser: Parser<T>,
    source: Record<string, string | undefined> = process.env
  ) {
    this._key = key;
    this._parser = parser;
    this._source = source;
  }

  /**
   * Mark this variable as required (default behavior).
   * Throws EnvMissingError if the variable is not set and has no default.
   */
  required(): EnvVar<T> {
    this._required = true;
    this._hasDefault = false;
    this._defaultValue = undefined;
    return this;
  }

  /**
   * Provide a default value. If the variable is not set, returns the default
   * instead of throwing.
   */
  default(value: T): EnvVar<T> {
    this._defaultValue = value;
    this._hasDefault = true;
    this._required = false;
    return this;
  }

  /**
   * Add a custom validator. The function receives the parsed value and must
   * return `true` for valid, `false` or an error string for invalid.
   */
  validate(fn: Validator<T>): EnvVar<T> {
    this._validators.push(fn);
    return this;
  }

  /**
   * Resolve the environment variable: read, parse, validate, return.
   */
  parse(): T {
    const raw = this._source[this._key];

    // Handle missing value
    if (raw === undefined || raw === '') {
      if (this._hasDefault) {
        return this._defaultValue as T;
      }
      if (this._required) {
        throw new EnvMissingError(this._key);
      }
      // Should not reach here given the API design, but just in case
      throw new EnvMissingError(this._key);
    }

    // Parse
    const parsed = this._parser(raw, this._key);

    // Validate
    for (const validator of this._validators) {
      const result = validator(parsed);
      if (result === false) {
        throw new EnvValidationError(this._key);
      }
      if (typeof result === 'string') {
        throw new EnvValidationError(this._key, result);
      }
    }

    return parsed;
  }
}

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/**
 * A schema is an object whose values are EnvVar builders.
 */
export type EnvSchema = Record<string, EnvVar<unknown>>;

/**
 * Infer the parsed result type from a schema.
 */
export type InferSchema<S extends EnvSchema> = {
  [K in keyof S]: S[K] extends EnvVar<infer T> ? T : never;
};

// ---------------------------------------------------------------------------
// Main env API
// ---------------------------------------------------------------------------

/**
 * Create a string environment variable builder.
 */
export function string(
  key: string,
  source?: Record<string, string | undefined>
): EnvVar<string> {
  return new EnvVar(key, parseString, source);
}

/**
 * Create a number environment variable builder.
 */
export function number(
  key: string,
  source?: Record<string, string | undefined>
): EnvVar<number> {
  return new EnvVar(key, parseNumber, source);
}

/**
 * Create a boolean environment variable builder.
 */
export function boolean(
  key: string,
  source?: Record<string, string | undefined>
): EnvVar<boolean> {
  return new EnvVar(key, parseBoolean, source);
}

/**
 * Create a JSON environment variable builder.
 */
export function json<T = unknown>(
  key: string,
  source?: Record<string, string | undefined>
): EnvVar<T> {
  return new EnvVar<T>(key, parseJson as Parser<T>, source);
}

/**
 * Parse a full schema object at once. Collects all errors and throws
 * an EnvSchemaError if any variables fail.
 *
 * @example
 * ```ts
 * const config = env.parse({
 *   port: env.number("PORT").default(3000),
 *   host: env.string("HOST").required(),
 *   debug: env.boolean("DEBUG").default(false),
 * });
 * // config is typed as { port: number; host: string; debug: boolean }
 * ```
 */
export function parse<S extends EnvSchema>(schema: S): InferSchema<S> {
  const result: Record<string, unknown> = {};
  const errors: Error[] = [];

  for (const [key, envVar] of Object.entries(schema)) {
    try {
      result[key] = envVar.parse();
    } catch (error) {
      errors.push(error as Error);
    }
  }

  if (errors.length > 0) {
    throw new EnvSchemaError(errors);
  }

  return result as InferSchema<S>;
}

/**
 * Load environment variables from a .env file using dotenv.
 * Requires `dotenv` to be installed as a peer dependency.
 *
 * @throws Error if dotenv is not installed
 */
export async function load(options: LoadOptions = {}): Promise<void> {
  try {
    // Use a variable to prevent TypeScript from resolving the module at compile time
    const moduleName = 'dotenv';
    const dotenv = await (Function('m', 'return import(m)')(moduleName) as Promise<{ config: (opts: { path?: string; override?: boolean }) => void }>);
    dotenv.config({
      path: options.path ?? '.env',
      override: options.override ?? false,
    });
  } catch {
    throw new Error(
      'dotenv is required for env.load(). Install it with: npm install dotenv'
    );
  }
}

// ---------------------------------------------------------------------------
// Default export — namespaced API
// ---------------------------------------------------------------------------

export const env = {
  string,
  number,
  boolean,
  json,
  parse,
  load,
  EnvVar,
};

export default env;
