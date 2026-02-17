// ---------------------------------------------------------------------------
// Core discriminated-union types
// ---------------------------------------------------------------------------

/** Represents a successful value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Represents a failure value. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * A discriminated union representing either success (`Ok<T>`) or
 * failure (`Err<E>`).
 *
 * Inspired by Rust's `Result` and Swift's `Result` types.
 */
export type Result<T, E> = Ok<T> | Err<E>;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/** Create a successful `Result` containing `value`. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed `Result` containing `error`. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Narrow a `Result` to `Ok`. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/** Narrow a `Result` to `Err`. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

/**
 * Apply `fn` to the contained `Ok` value, leaving `Err` untouched.
 *
 * ```ts
 * map(ok(2), x => x * 2)  // Ok(4)
 * map(err("e"), x => x)   // Err("e")
 * ```
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Apply `fn` to the contained `Err` value, leaving `Ok` untouched.
 *
 * ```ts
 * mapErr(err("bad"), e => new Error(e))  // Err(Error("bad"))
 * mapErr(ok(1), e => e)                  // Ok(1)
 * ```
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Chain a computation that itself returns a `Result`.
 * Also known as `andThen` or `chain`.
 *
 * ```ts
 * flatMap(ok(2), x => ok(x * 2))    // Ok(4)
 * flatMap(ok(2), x => err("nope"))   // Err("nope")
 * flatMap(err("e"), x => ok(x))      // Err("e")
 * ```
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Alias for {@link flatMap}. */
export const andThen = flatMap;

// ---------------------------------------------------------------------------
// Unwrap helpers
// ---------------------------------------------------------------------------

/**
 * Return the contained `Ok` value or **throw** if `Err`.
 *
 * @throws The contained error when called on an `Err`.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/**
 * Return the contained `Ok` value, or `fallback` if `Err`.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Return the contained `Ok` value, or compute a fallback from the error.
 */
export function unwrapOrElse<T, E>(
  result: Result<T, E>,
  fn: (error: E) => T,
): T {
  return result.ok ? result.value : fn(result.error);
}

/**
 * Return the contained `Err` value or **throw** if `Ok`.
 *
 * @throws The contained value when called on an `Ok`.
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw result.value;
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Exhaustive pattern matching on a `Result`.
 *
 * ```ts
 * match(result, {
 *   ok:  value => `Got ${value}`,
 *   err: error => `Failed: ${error}`,
 * })
 * ```
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => U; err: (error: E) => U },
): U {
  return result.ok ? handlers.ok(result.value) : handlers.err(result.error);
}

// ---------------------------------------------------------------------------
// Async / throwable wrappers
// ---------------------------------------------------------------------------

/**
 * Wrap a `Promise` into a `Result`.
 *
 * ```ts
 * const result = await fromPromise(fetch("/api"))
 * ```
 */
export async function fromPromise<T, E = unknown>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (error) {
    return err(error as E);
  }
}

/**
 * Wrap a function that may throw into one that returns a `Result`.
 *
 * ```ts
 * const safeParse = fromThrowable(JSON.parse)
 * safeParse("{}") // Ok({})
 * safeParse("!!")  // Err(SyntaxError)
 * ```
 */
export function fromThrowable<A extends unknown[], T, E = unknown>(
  fn: (...args: A) => T,
): (...args: A) => Result<T, E> {
  return (...args: A): Result<T, E> => {
    try {
      return ok(fn(...args));
    } catch (error) {
      return err(error as E);
    }
  };
}

// ---------------------------------------------------------------------------
// Combining multiple Results
// ---------------------------------------------------------------------------

/**
 * Collect an array (or tuple) of `Result`s into a single `Result` of an
 * array. Short-circuits on the first `Err`.
 *
 * Works with tuples to preserve per-element types:
 *
 * ```ts
 * combine([ok(1), ok("two")])
 * // => Ok([1, "two"])  — typed as Result<[number, string], never>
 *
 * combine([ok(1), err("bad")])
 * // => Err("bad")
 * ```
 */
export function combine<R extends readonly Result<unknown, unknown>[]>(
  results: readonly [...R],
): Result<
  { [K in keyof R]: R[K] extends Result<infer T, unknown> ? T : never },
  { [K in keyof R]: R[K] extends Result<unknown, infer E> ? E : never }[number]
> {
  const values: unknown[] = [];
  for (const r of results) {
    if (!r.ok) return r as never;
    values.push(r.value);
  }
  return ok(values) as never;
}

// ---------------------------------------------------------------------------
// Tap / inspect helpers (side-effects without altering the Result)
// ---------------------------------------------------------------------------

/**
 * Run a side-effect on the `Ok` value without changing the Result.
 */
export function tap<T, E>(
  result: Result<T, E>,
  fn: (value: T) => void,
): Result<T, E> {
  if (result.ok) fn(result.value);
  return result;
}

/**
 * Run a side-effect on the `Err` value without changing the Result.
 */
export function tapErr<T, E>(
  result: Result<T, E>,
  fn: (error: E) => void,
): Result<T, E> {
  if (!result.ok) fn(result.error);
  return result;
}
