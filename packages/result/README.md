# @corvidlabs/result

> Type-safe `Result<T, E>` for TypeScript — inspired by Rust and Swift.

A tiny, zero-dependency library that brings **railway-oriented error handling** to TypeScript. Replace thrown exceptions with explicit, composable `Result` values that keep your types honest and your error paths visible.

## Features

- **Discriminated union** — `Result<T, E>` is `Ok<T> | Err<E>`, fully narrowable with `if (result.ok)`.
- **Type guards** — `isOk()` and `isErr()` for when you need runtime checks.
- **Transformations** — `map`, `mapErr`, `flatMap` / `andThen` for composable pipelines.
- **Pattern matching** — `match()` for exhaustive handling of both branches.
- **Unwrap helpers** — `unwrap`, `unwrapOr`, `unwrapOrElse`, `unwrapErr`.
- **Async & throwable wrappers** — `fromPromise`, `fromThrowable`.
- **Combine** — Collect an array of Results into a Result of an array (with tuple type inference).
- **Side-effect taps** — `tap`, `tapErr` for logging / debugging without altering the Result.
- **Zero dependencies**, tiny bundle (&lt; 1 KB gzipped).
- **Full TypeScript inference** — generics flow correctly everywhere.
- **ESM + CJS** dual output.

## Installation

```bash
npm install @corvidlabs/result
# or
bun add @corvidlabs/result
# or
pnpm add @corvidlabs/result
```

## Quick Start

```ts
import { ok, err, map, flatMap, match, type Result } from "@corvidlabs/result";

// Create results
const success = ok(42);        // Ok<number>
const failure = err("oops");   // Err<string>

// Transform values
const doubled = map(success, (x) => x * 2); // Ok(84)

// Chain computations
const divide = (a: number, b: number): Result<number, string> =>
  b === 0 ? err("division by zero") : ok(a / b);

const result = flatMap(ok(10), (x) => divide(x, 2)); // Ok(5)

// Pattern match
const message = match(result, {
  ok:  (value) => `Result: ${value}`,
  err: (error) => `Error: ${error}`,
});
```

## API Reference

### Types

```ts
interface Ok<T>  { readonly ok: true;  readonly value: T }
interface Err<E> { readonly ok: false; readonly error: E }
type Result<T, E> = Ok<T> | Err<E>
```

### Constructors

#### `ok<T>(value: T): Ok<T>`

Create a successful result.

```ts
ok(42)           // { ok: true, value: 42 }
ok("hello")      // { ok: true, value: "hello" }
```

#### `err<E>(error: E): Err<E>`

Create a failed result.

```ts
err("not found")         // { ok: false, error: "not found" }
err(new Error("fail"))   // { ok: false, error: Error("fail") }
```

### Type Guards

#### `isOk<T, E>(result: Result<T, E>): result is Ok<T>`

Narrow a Result to Ok.

```ts
const result: Result<number, string> = ok(42);
if (isOk(result)) {
  console.log(result.value); // ✅ TypeScript knows this is number
}
```

#### `isErr<T, E>(result: Result<T, E>): result is Err<E>`

Narrow a Result to Err.

```ts
if (isErr(result)) {
  console.log(result.error); // ✅ TypeScript knows this is string
}
```

### Transformations

#### `map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>`

Transform the Ok value, leaving Err untouched.

```ts
map(ok(2), (x) => x * 3)    // Ok(6)
map(err("e"), (x) => x * 3) // Err("e")
```

#### `mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F>`

Transform the Err value, leaving Ok untouched.

```ts
mapErr(err("bad"), (e) => new Error(e))  // Err(Error("bad"))
mapErr(ok(1), (e) => new Error(e))       // Ok(1)
```

#### `flatMap<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E>`

Chain a computation that returns a Result. Also exported as `andThen`.

```ts
flatMap(ok(2), (x) => ok(x * 2))   // Ok(4)
flatMap(ok(2), (_) => err("nope"))  // Err("nope")
flatMap(err("e"), (x) => ok(x))    // Err("e") — fn never called
```

### Unwrap Helpers

#### `unwrap<T, E>(result: Result<T, E>): T`

Extract the Ok value, or **throw** the error.

```ts
unwrap(ok(42))      // 42
unwrap(err("boom")) // throws "boom"
```

#### `unwrapOr<T, E>(result: Result<T, E>, fallback: T): T`

Extract the Ok value, or return a fallback.

```ts
unwrapOr(ok(42), 0)           // 42
unwrapOr(err("fail"), 0)      // 0
```

#### `unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T`

Extract the Ok value, or compute a fallback from the error.

```ts
unwrapOrElse(err("fail"), (e) => e.length) // 4
```

#### `unwrapErr<T, E>(result: Result<T, E>): E`

Extract the Err value, or **throw** the Ok value.

```ts
unwrapErr(err("oops")) // "oops"
unwrapErr(ok(42))       // throws 42
```

### Pattern Matching

#### `match<T, E, U>(result: Result<T, E>, handlers: { ok: (value: T) => U; err: (error: E) => U }): U`

Exhaustive pattern matching.

```ts
match(result, {
  ok:  (value) => `Got: ${value}`,
  err: (error) => `Failed: ${error}`,
});
```

### Async & Throwable Wrappers

#### `fromPromise<T, E = unknown>(promise: Promise<T>): Promise<Result<T, E>>`

Wrap a Promise into a Result.

```ts
const result = await fromPromise(fetch("/api/users"));
if (isOk(result)) {
  // result.value is Response
}
```

#### `fromThrowable<A extends unknown[], T, E = unknown>(fn: (...args: A) => T): (...args: A) => Result<T, E>`

Wrap a function that might throw into one that returns a Result.

```ts
const safeParse = fromThrowable(JSON.parse);
safeParse("{}")       // Ok({})
safeParse("invalid")  // Err(SyntaxError(...))
```

### Combining Results

#### `combine<R extends readonly Result[]>(results: [...R]): Result<[...values], error>`

Collect an array of Results into a single Result. Short-circuits on the first Err. Preserves tuple types.

```ts
combine([ok(1), ok("two"), ok(true)])
// Ok([1, "two", true]) — typed as Result<[number, string, boolean], never>

combine([ok(1), err("fail"), ok(3)])
// Err("fail")
```

### Side-Effect Helpers

#### `tap<T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E>`

Run a side-effect on the Ok value without changing the Result. Useful for logging.

```ts
tap(ok(42), (v) => console.log("Got:", v)) // logs "Got: 42", returns Ok(42)
```

#### `tapErr<T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E>`

Run a side-effect on the Err value without changing the Result.

```ts
tapErr(err("fail"), (e) => console.error(e)) // logs "fail", returns Err("fail")
```

## Design Decisions

### Why standalone functions instead of a class?

Standalone functions are **tree-shakeable** — bundlers can eliminate unused functions. A class with methods forces the entire API into the bundle even if you only use `ok()` and `isOk()`.

The plain-object representation (`{ ok: true, value }` / `{ ok: false, error }`) is also trivially serializable to JSON without custom logic.

### Why not `Option<T>`?

This library focuses on `Result<T, E>`. For optional values, TypeScript's built-in `T | undefined` works well with the `??` and `?.` operators. If you need a full `Option` type, that would be a separate package.

## License

[MIT](./LICENSE) &copy; CorvidLabs
