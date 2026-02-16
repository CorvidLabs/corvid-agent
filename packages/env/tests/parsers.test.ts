import { describe, it, expect } from 'vitest';
import {
  parseString,
  parseNumber,
  parseBoolean,
  parseJson,
  EnvParseError,
  EnvMissingError,
  EnvValidationError,
  EnvSchemaError,
} from '../src/parsers.js';

describe('parseString', () => {
  it('returns the raw string value', () => {
    expect(parseString('hello', 'KEY')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(parseString('', 'KEY')).toBe('');
  });

  it('preserves whitespace', () => {
    expect(parseString('  spaces  ', 'KEY')).toBe('  spaces  ');
  });
});

describe('parseNumber', () => {
  it('parses integers', () => {
    expect(parseNumber('42', 'PORT')).toBe(42);
  });

  it('parses negative numbers', () => {
    expect(parseNumber('-10', 'OFFSET')).toBe(-10);
  });

  it('parses floats', () => {
    expect(parseNumber('3.14', 'PI')).toBeCloseTo(3.14);
  });

  it('parses zero', () => {
    expect(parseNumber('0', 'COUNT')).toBe(0);
  });

  it('throws EnvParseError for non-numeric strings', () => {
    expect(() => parseNumber('abc', 'PORT')).toThrow(EnvParseError);
    expect(() => parseNumber('abc', 'PORT')).toThrow(
      'must be a valid number'
    );
  });

  it('parses empty string as 0 (Number("") === 0)', () => {
    // Note: Number('') returns 0 in JavaScript, which is valid
    expect(parseNumber('', 'PORT')).toBe(0);
  });
});

describe('parseBoolean', () => {
  it.each(['true', 'TRUE', 'True', '1', 'yes', 'YES', 'on', 'ON'])(
    'parses "%s" as true',
    (val) => {
      expect(parseBoolean(val, 'DEBUG')).toBe(true);
    }
  );

  it.each(['false', 'FALSE', 'False', '0', 'no', 'NO', 'off', 'OFF'])(
    'parses "%s" as false',
    (val) => {
      expect(parseBoolean(val, 'DEBUG')).toBe(false);
    }
  );

  it('trims whitespace', () => {
    expect(parseBoolean('  true  ', 'DEBUG')).toBe(true);
  });

  it('throws EnvParseError for invalid values', () => {
    expect(() => parseBoolean('maybe', 'DEBUG')).toThrow(EnvParseError);
    expect(() => parseBoolean('2', 'DEBUG')).toThrow('must be a boolean');
  });
});

describe('parseJson', () => {
  it('parses JSON objects', () => {
    expect(parseJson('{"a":1}', 'CONFIG')).toEqual({ a: 1 });
  });

  it('parses JSON arrays', () => {
    expect(parseJson('[1,2,3]', 'LIST')).toEqual([1, 2, 3]);
  });

  it('parses JSON strings', () => {
    expect(parseJson('"hello"', 'VAL')).toBe('hello');
  });

  it('parses JSON numbers', () => {
    expect(parseJson('42', 'NUM')).toBe(42);
  });

  it('parses JSON booleans', () => {
    expect(parseJson('true', 'BOOL')).toBe(true);
  });

  it('parses null', () => {
    expect(parseJson('null', 'NULLABLE')).toBeNull();
  });

  it('throws EnvParseError for invalid JSON', () => {
    expect(() => parseJson('{invalid', 'CONFIG')).toThrow(EnvParseError);
    expect(() => parseJson('{invalid', 'CONFIG')).toThrow('must be valid JSON');
  });
});

describe('Error classes', () => {
  it('EnvParseError has correct name and key', () => {
    const err = new EnvParseError('test', 'KEY');
    expect(err.name).toBe('EnvParseError');
    expect(err.key).toBe('KEY');
    expect(err.message).toBe('test');
  });

  it('EnvMissingError has correct name and key', () => {
    const err = new EnvMissingError('API_KEY');
    expect(err.name).toBe('EnvMissingError');
    expect(err.key).toBe('API_KEY');
    expect(err.message).toContain('API_KEY');
  });

  it('EnvValidationError has correct name and key', () => {
    const err = new EnvValidationError('PORT', 'must be > 0');
    expect(err.name).toBe('EnvValidationError');
    expect(err.key).toBe('PORT');
    expect(err.message).toContain('must be > 0');
  });

  it('EnvValidationError works without custom message', () => {
    const err = new EnvValidationError('PORT');
    expect(err.message).toContain('PORT');
  });

  it('EnvSchemaError aggregates multiple errors', () => {
    const errors = [
      new EnvMissingError('KEY1'),
      new EnvMissingError('KEY2'),
    ];
    const err = new EnvSchemaError(errors);
    expect(err.name).toBe('EnvSchemaError');
    expect(err.errors).toHaveLength(2);
    expect(err.message).toContain('KEY1');
    expect(err.message).toContain('KEY2');
  });
});
