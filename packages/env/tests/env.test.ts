import { describe, it, expect, beforeEach } from 'vitest';
import {
  string,
  number,
  boolean,
  json,
  parse,
  EnvVar,
} from '../src/index.js';
import {
  EnvMissingError,
  EnvValidationError,
  EnvSchemaError,
  EnvParseError,
} from '../src/parsers.js';

// Helper: create a mock env source
function mockEnv(vars: Record<string, string>): Record<string, string | undefined> {
  return vars;
}

describe('env.string()', () => {
  it('reads a string variable', () => {
    const source = mockEnv({ NAME: 'hello' });
    expect(string('NAME', source).parse()).toBe('hello');
  });

  it('throws for missing required variable', () => {
    const source = mockEnv({});
    expect(() => string('NAME', source).parse()).toThrow(EnvMissingError);
  });

  it('throws for empty string (treated as missing)', () => {
    const source = mockEnv({ NAME: '' });
    expect(() => string('NAME', source).parse()).toThrow(EnvMissingError);
  });

  it('uses default value when variable is missing', () => {
    const source = mockEnv({});
    expect(string('NAME', source).default('fallback').parse()).toBe('fallback');
  });

  it('uses actual value over default when present', () => {
    const source = mockEnv({ NAME: 'actual' });
    expect(string('NAME', source).default('fallback').parse()).toBe('actual');
  });
});

describe('env.number()', () => {
  it('reads a number variable', () => {
    const source = mockEnv({ PORT: '3000' });
    expect(number('PORT', source).parse()).toBe(3000);
  });

  it('throws for non-numeric value', () => {
    const source = mockEnv({ PORT: 'abc' });
    expect(() => number('PORT', source).parse()).toThrow(EnvParseError);
  });

  it('uses default value', () => {
    const source = mockEnv({});
    expect(number('PORT', source).default(8080).parse()).toBe(8080);
  });

  it('parses zero correctly', () => {
    const source = mockEnv({ COUNT: '0' });
    expect(number('COUNT', source).parse()).toBe(0);
  });
});

describe('env.boolean()', () => {
  it('reads a boolean variable', () => {
    const source = mockEnv({ DEBUG: 'true' });
    expect(boolean('DEBUG', source).parse()).toBe(true);
  });

  it('reads false value', () => {
    const source = mockEnv({ DEBUG: 'false' });
    expect(boolean('DEBUG', source).parse()).toBe(false);
  });

  it('uses default value', () => {
    const source = mockEnv({});
    expect(boolean('DEBUG', source).default(false).parse()).toBe(false);
  });

  it('throws for invalid boolean', () => {
    const source = mockEnv({ DEBUG: 'maybe' });
    expect(() => boolean('DEBUG', source).parse()).toThrow(EnvParseError);
  });
});

describe('env.json()', () => {
  it('reads a JSON object', () => {
    const source = mockEnv({ CONFIG: '{"host":"localhost","port":5432}' });
    const result = json<{ host: string; port: number }>('CONFIG', source).parse();
    expect(result).toEqual({ host: 'localhost', port: 5432 });
  });

  it('reads a JSON array', () => {
    const source = mockEnv({ TAGS: '["a","b","c"]' });
    expect(json<string[]>('TAGS', source).parse()).toEqual(['a', 'b', 'c']);
  });

  it('uses default value', () => {
    const source = mockEnv({});
    expect(json('CONFIG', source).default({ fallback: true }).parse()).toEqual({
      fallback: true,
    });
  });

  it('throws for invalid JSON', () => {
    const source = mockEnv({ CONFIG: '{not json' });
    expect(() => json('CONFIG', source).parse()).toThrow(EnvParseError);
  });
});

describe('.required()', () => {
  it('is the default behavior', () => {
    const source = mockEnv({});
    expect(() => string('KEY', source).parse()).toThrow(EnvMissingError);
  });

  it('can be chained explicitly', () => {
    const source = mockEnv({});
    expect(() => string('KEY', source).required().parse()).toThrow(
      EnvMissingError
    );
  });

  it('overrides a previous .default()', () => {
    const source = mockEnv({});
    expect(() =>
      string('KEY', source).default('fallback').required().parse()
    ).toThrow(EnvMissingError);
  });
});

describe('.default()', () => {
  it('provides fallback for missing variables', () => {
    const source = mockEnv({});
    expect(string('KEY', source).default('fallback').parse()).toBe('fallback');
  });

  it('does not use default when value is present', () => {
    const source = mockEnv({ KEY: 'actual' });
    expect(string('KEY', source).default('fallback').parse()).toBe('actual');
  });

  it('overrides a previous .required()', () => {
    const source = mockEnv({});
    expect(
      string('KEY', source).required().default('fallback').parse()
    ).toBe('fallback');
  });
});

describe('.validate()', () => {
  it('passes when validator returns true', () => {
    const source = mockEnv({ PORT: '3000' });
    const result = number('PORT', source)
      .validate((v) => v > 0)
      .parse();
    expect(result).toBe(3000);
  });

  it('throws when validator returns false', () => {
    const source = mockEnv({ PORT: '-1' });
    expect(() =>
      number('PORT', source)
        .validate((v) => v > 0)
        .parse()
    ).toThrow(EnvValidationError);
  });

  it('throws with custom message when validator returns string', () => {
    const source = mockEnv({ PORT: '-1' });
    expect(() =>
      number('PORT', source)
        .validate((v) => (v > 0 ? true : 'must be positive'))
        .parse()
    ).toThrow('must be positive');
  });

  it('supports multiple validators', () => {
    const source = mockEnv({ PORT: '100' });
    const result = number('PORT', source)
      .validate((v) => v > 0)
      .validate((v) => v < 65536)
      .parse();
    expect(result).toBe(100);
  });

  it('fails on second validator', () => {
    const source = mockEnv({ PORT: '70000' });
    expect(() =>
      number('PORT', source)
        .validate((v) => v > 0)
        .validate((v) => (v < 65536 ? true : 'port must be < 65536'))
        .parse()
    ).toThrow('port must be < 65536');
  });

  it('does not run validators when using default', () => {
    const source = mockEnv({});
    // Default of 0 would fail the validator, but it shouldn't be called
    const result = number('PORT', source)
      .default(0)
      .validate((v) => v > 0)
      .parse();
    expect(result).toBe(0);
  });
});

describe('env.parse()', () => {
  it('parses a full schema', () => {
    const source = mockEnv({
      HOST: 'localhost',
      PORT: '3000',
      DEBUG: 'true',
    });

    const config = parse({
      host: string('HOST', source),
      port: number('PORT', source).default(8080),
      debug: boolean('DEBUG', source).default(false),
    });

    expect(config).toEqual({
      host: 'localhost',
      port: 3000,
      debug: true,
    });
  });

  it('uses defaults in schema', () => {
    const source = mockEnv({});

    const config = parse({
      port: number('PORT', source).default(8080),
      debug: boolean('DEBUG', source).default(false),
    });

    expect(config).toEqual({
      port: 8080,
      debug: false,
    });
  });

  it('collects all errors and throws EnvSchemaError', () => {
    const source = mockEnv({});

    expect(() =>
      parse({
        host: string('HOST', source),
        port: number('PORT', source),
        apiKey: string('API_KEY', source),
      })
    ).toThrow(EnvSchemaError);
  });

  it('EnvSchemaError contains all individual errors', () => {
    const source = mockEnv({});

    try {
      parse({
        host: string('HOST', source),
        port: number('PORT', source),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(EnvSchemaError);
      const schemaErr = err as EnvSchemaError;
      expect(schemaErr.errors).toHaveLength(2);
      expect(schemaErr.message).toContain('HOST');
      expect(schemaErr.message).toContain('PORT');
    }
  });

  it('mixes successful and failed parses', () => {
    const source = mockEnv({ HOST: 'localhost' });

    expect(() =>
      parse({
        host: string('HOST', source),
        port: number('PORT', source),
      })
    ).toThrow(EnvSchemaError);

    try {
      parse({
        host: string('HOST', source),
        port: number('PORT', source),
      });
    } catch (err) {
      const schemaErr = err as EnvSchemaError;
      expect(schemaErr.errors).toHaveLength(1);
      expect(schemaErr.message).toContain('PORT');
      expect(schemaErr.message).not.toContain('HOST');
    }
  });
});

describe('EnvVar class', () => {
  it('is exported and constructable', () => {
    const source = mockEnv({ KEY: 'value' });
    const v = new EnvVar('KEY', (val) => val, source);
    expect(v.parse()).toBe('value');
  });
});

describe('chaining combinations', () => {
  it('default + validate', () => {
    const source = mockEnv({});
    // Default should not go through validation
    const result = number('PORT', source)
      .default(3000)
      .validate((v) => v > 0)
      .parse();
    expect(result).toBe(3000);
  });

  it('required + validate', () => {
    const source = mockEnv({ PORT: '3000' });
    const result = number('PORT', source)
      .required()
      .validate((v) => v > 0)
      .parse();
    expect(result).toBe(3000);
  });

  it('string with validate', () => {
    const source = mockEnv({ EMAIL: 'test@example.com' });
    const result = string('EMAIL', source)
      .validate((v) => v.includes('@'))
      .parse();
    expect(result).toBe('test@example.com');
  });

  it('json with validate', () => {
    const source = mockEnv({ CONFIG: '{"port":3000}' });
    const result = json<{ port: number }>('CONFIG', source)
      .validate((v) => v.port > 0)
      .parse();
    expect(result).toEqual({ port: 3000 });
  });
});
