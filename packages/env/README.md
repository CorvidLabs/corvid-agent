# @corvid-agent/env

Type-safe environment variable parser for TypeScript/Node.js. Zero runtime dependencies.

## Installation

```bash
npm install @corvid-agent/env
```

Optionally install `dotenv` to load `.env` files:

```bash
npm install dotenv
```

## Usage

```ts
import { env } from '@corvid-agent/env';

// Parse individual variables
const port = env.number('PORT').default(3000).parse();
const host = env.string('HOST').required().parse();
const debug = env.boolean('DEBUG').default(false).parse();
const config = env.json<{ retries: number }>('CONFIG').default({ retries: 3 }).parse();
```

### Schema Parsing

Parse all variables at once with collected error reporting:

```ts
import { env } from '@corvid-agent/env';

const config = env.parse({
  port: env.number('PORT').default(3000),
  host: env.string('HOST').required(),
  debug: env.boolean('DEBUG').default(false),
  dbConfig: env.json<{ host: string; port: number }>('DB_CONFIG').required(),
});

// config is fully typed:
// { port: number; host: string; debug: boolean; dbConfig: { host: string; port: number } }
```

If any required variables are missing or invalid, `env.parse()` throws an `EnvSchemaError` containing all individual errors at once.

### Custom Validation

```ts
const port = env.number('PORT')
  .required()
  .validate((v) => v > 0 && v < 65536)
  .parse();

// With custom error messages
const email = env.string('ADMIN_EMAIL')
  .required()
  .validate((v) => v.includes('@') ? true : 'must be a valid email')
  .parse();
```

### Loading .env Files

```ts
import { env } from '@corvid-agent/env';

// Load .env file (requires dotenv peer dependency)
await env.load();
await env.load({ path: '.env.local', override: true });
```

## API

### Type Parsers

| Method | Description |
|--------|-------------|
| `env.string(key)` | Parse as string |
| `env.number(key)` | Parse as number (int or float) |
| `env.boolean(key)` | Parse as boolean (`true/false/1/0/yes/no/on/off`) |
| `env.json<T>(key)` | Parse as JSON with optional type parameter |

### Chaining Methods

| Method | Description |
|--------|-------------|
| `.required()` | Mark as required (default behavior) |
| `.default(value)` | Provide a fallback value |
| `.validate(fn)` | Add custom validation (return `true`, `false`, or error string) |
| `.parse()` | Execute parsing and return the value |

### Schema Parsing

| Method | Description |
|--------|-------------|
| `env.parse(schema)` | Parse all variables in the schema, collecting all errors |

### .env File Loading

| Method | Description |
|--------|-------------|
| `env.load(options?)` | Load from `.env` file (requires `dotenv` peer dep) |

## Error Types

| Error | When |
|-------|------|
| `EnvMissingError` | Required variable is not set |
| `EnvParseError` | Value cannot be parsed to the target type |
| `EnvValidationError` | Custom validation fails |
| `EnvSchemaError` | One or more variables in a schema fail (contains all errors) |

## Design Decisions

- **Zero runtime dependencies**: The core library has no dependencies. `dotenv` is an optional peer dependency only needed for `.env` file loading.
- **Empty strings are treated as missing**: An empty string `""` is considered equivalent to an unset variable.
- **Defaults skip validation**: When a default value is used (variable not set), validators are not run against the default.
- **Schema parsing collects all errors**: `env.parse()` doesn't short-circuit on the first error -- it collects all failures and reports them together.

## License

MIT
