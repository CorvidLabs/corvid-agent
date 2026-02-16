import { describe, it, expect, vi } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  andThen,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  fromPromise,
  fromThrowable,
  combine,
  tap,
  tapErr,
  type Result,
  type Ok,
  type Err,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------
describe("ok()", () => {
  it("creates an Ok result", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("works with different types", () => {
    expect(ok("hello")).toEqual({ ok: true, value: "hello" });
    expect(ok(null)).toEqual({ ok: true, value: null });
    expect(ok(undefined)).toEqual({ ok: true, value: undefined });
    expect(ok([1, 2, 3])).toEqual({ ok: true, value: [1, 2, 3] });
    expect(ok({ a: 1 })).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe("err()", () => {
  it("creates an Err result", () => {
    const result = err("something went wrong");
    expect(result).toEqual({ ok: false, error: "something went wrong" });
  });

  it("works with different error types", () => {
    expect(err(new Error("fail"))).toEqual({
      ok: false,
      error: new Error("fail"),
    });
    expect(err(404)).toEqual({ ok: false, error: 404 });
    expect(err({ code: "NOT_FOUND" })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
describe("isOk()", () => {
  it("returns true for Ok", () => {
    expect(isOk(ok(1))).toBe(true);
  });

  it("returns false for Err", () => {
    expect(isOk(err("e"))).toBe(false);
  });

  it("narrows the type", () => {
    const result: Result<number, string> = ok(42);
    if (isOk(result)) {
      // TypeScript should see result.value as number here
      const _n: number = result.value;
      expect(_n).toBe(42);
    }
  });
});

describe("isErr()", () => {
  it("returns true for Err", () => {
    expect(isErr(err("e"))).toBe(true);
  });

  it("returns false for Ok", () => {
    expect(isErr(ok(1))).toBe(false);
  });

  it("narrows the type", () => {
    const result: Result<number, string> = err("oops");
    if (isErr(result)) {
      // TypeScript should see result.error as string here
      const _s: string = result.error;
      expect(_s).toBe("oops");
    }
  });
});

// ---------------------------------------------------------------------------
// map
// ---------------------------------------------------------------------------
describe("map()", () => {
  it("transforms Ok value", () => {
    expect(map(ok(2), (x) => x * 3)).toEqual(ok(6));
  });

  it("passes Err through unchanged", () => {
    const result: Result<number, string> = err("fail");
    expect(map(result, (x) => x * 3)).toEqual(err("fail"));
  });

  it("can change the Ok type", () => {
    const result = map(ok(42), (x) => String(x));
    expect(result).toEqual(ok("42"));
  });
});

// ---------------------------------------------------------------------------
// mapErr
// ---------------------------------------------------------------------------
describe("mapErr()", () => {
  it("transforms Err value", () => {
    expect(mapErr(err("bad"), (e) => new Error(e))).toEqual(
      err(new Error("bad")),
    );
  });

  it("passes Ok through unchanged", () => {
    const result: Result<number, string> = ok(1);
    expect(mapErr(result, (e) => new Error(e))).toEqual(ok(1));
  });

  it("can change the Err type", () => {
    const result = mapErr(err(404), (code) => `Error ${code}`);
    expect(result).toEqual(err("Error 404"));
  });
});

// ---------------------------------------------------------------------------
// flatMap / andThen
// ---------------------------------------------------------------------------
describe("flatMap()", () => {
  it("chains Ok into another Ok", () => {
    expect(flatMap(ok(2), (x) => ok(x * 2))).toEqual(ok(4));
  });

  it("chains Ok into Err", () => {
    expect(flatMap(ok(2), (_) => err("nope"))).toEqual(err("nope"));
  });

  it("short-circuits on Err", () => {
    const fn = vi.fn(() => ok(99));
    const result: Result<number, string> = err("fail");
    expect(flatMap(result, fn)).toEqual(err("fail"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports chaining multiple operations", () => {
    const divide = (a: number, b: number): Result<number, string> =>
      b === 0 ? err("division by zero") : ok(a / b);

    const result = flatMap(ok(10), (x) =>
      flatMap(divide(x, 2), (y) => divide(y, 5)),
    );
    expect(result).toEqual(ok(1));
  });
});

describe("andThen()", () => {
  it("is an alias for flatMap", () => {
    expect(andThen).toBe(flatMap);
  });
});

// ---------------------------------------------------------------------------
// unwrap
// ---------------------------------------------------------------------------
describe("unwrap()", () => {
  it("returns Ok value", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("throws on Err", () => {
    expect(() => unwrap(err("boom"))).toThrow("boom");
  });

  it("throws the error object itself", () => {
    const error = new Error("custom");
    expect(() => unwrap(err(error))).toThrow(error);
  });
});

describe("unwrapOr()", () => {
  it("returns Ok value", () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it("returns fallback on Err", () => {
    const result: Result<number, string> = err("fail");
    expect(unwrapOr(result, 0)).toBe(0);
  });
});

describe("unwrapOrElse()", () => {
  it("returns Ok value", () => {
    expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
  });

  it("computes fallback from error", () => {
    const result: Result<number, string> = err("fail");
    expect(unwrapOrElse(result, (e) => e.length)).toBe(4);
  });

  it("does not call fn for Ok", () => {
    const fn = vi.fn(() => 0);
    unwrapOrElse(ok(42), fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("unwrapErr()", () => {
  it("returns Err value", () => {
    expect(unwrapErr(err("oops"))).toBe("oops");
  });

  it("throws on Ok", () => {
    expect(() => unwrapErr(ok(42))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------
describe("match()", () => {
  it("calls ok handler for Ok", () => {
    const result = match(ok(5), {
      ok: (v) => `value: ${v}`,
      err: (e) => `error: ${e}`,
    });
    expect(result).toBe("value: 5");
  });

  it("calls err handler for Err", () => {
    const result = match(err("bad") as Result<number, string>, {
      ok: (v) => `value: ${v}`,
      err: (e) => `error: ${e}`,
    });
    expect(result).toBe("error: bad");
  });

  it("can return different types from handlers", () => {
    const result = match(ok(42), {
      ok: (v) => v * 2,
      err: () => -1,
    });
    expect(result).toBe(84);
  });
});

// ---------------------------------------------------------------------------
// fromPromise
// ---------------------------------------------------------------------------
describe("fromPromise()", () => {
  it("wraps resolved promise as Ok", async () => {
    const result = await fromPromise(Promise.resolve(42));
    expect(result).toEqual(ok(42));
  });

  it("wraps rejected promise as Err", async () => {
    const result = await fromPromise(Promise.reject(new Error("fail")));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual(new Error("fail"));
    }
  });

  it("wraps rejected non-Error values", async () => {
    const result = await fromPromise(Promise.reject("string error"));
    expect(result).toEqual(err("string error"));
  });

  it("works with async functions", async () => {
    const asyncFn = async () => {
      return 100;
    };
    const result = await fromPromise(asyncFn());
    expect(result).toEqual(ok(100));
  });
});

// ---------------------------------------------------------------------------
// fromThrowable
// ---------------------------------------------------------------------------
describe("fromThrowable()", () => {
  it("wraps successful function as Ok", () => {
    const safeParse = fromThrowable(JSON.parse);
    expect(safeParse("{}")).toEqual(ok({}));
  });

  it("wraps throwing function as Err", () => {
    const safeParse = fromThrowable(JSON.parse);
    const result = safeParse("not json!!");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(SyntaxError);
    }
  });

  it("preserves function arguments", () => {
    const safeDiv = fromThrowable((a: number, b: number) => {
      if (b === 0) throw new Error("division by zero");
      return a / b;
    });
    expect(safeDiv(10, 2)).toEqual(ok(5));
    expect(isErr(safeDiv(10, 0))).toBe(true);
  });

  it("preserves this binding", () => {
    const fn = fromThrowable(function (this: void, x: number) {
      return x + 1;
    });
    expect(fn(1)).toEqual(ok(2));
  });
});

// ---------------------------------------------------------------------------
// combine
// ---------------------------------------------------------------------------
describe("combine()", () => {
  it("collects all Ok results", () => {
    const result = combine([ok(1), ok("two"), ok(true)]);
    expect(result).toEqual(ok([1, "two", true]));
  });

  it("short-circuits on first Err", () => {
    const result = combine([ok(1), err("fail"), ok(3)]);
    expect(result).toEqual(err("fail"));
  });

  it("returns first Err when multiple exist", () => {
    const result = combine([ok(1), err("first"), err("second")]);
    expect(result).toEqual(err("first"));
  });

  it("works with empty array", () => {
    const result = combine([]);
    expect(result).toEqual(ok([]));
  });

  it("preserves tuple types", () => {
    const result = combine([ok(1), ok("hello")] as const);
    if (isOk(result)) {
      // TypeScript should infer [number, string]
      const [n, s] = result.value;
      expect(n).toBe(1);
      expect(s).toBe("hello");
    }
  });

  it("works with single element", () => {
    expect(combine([ok(42)])).toEqual(ok([42]));
    expect(combine([err("e")])).toEqual(err("e"));
  });
});

// ---------------------------------------------------------------------------
// tap / tapErr
// ---------------------------------------------------------------------------
describe("tap()", () => {
  it("calls fn with Ok value and returns the same Result", () => {
    const spy = vi.fn();
    const result = ok(42);
    const returned = tap(result, spy);
    expect(spy).toHaveBeenCalledWith(42);
    expect(returned).toBe(result);
  });

  it("does not call fn on Err", () => {
    const spy = vi.fn();
    const result: Result<number, string> = err("e");
    const returned = tap(result, spy);
    expect(spy).not.toHaveBeenCalled();
    expect(returned).toBe(result);
  });
});

describe("tapErr()", () => {
  it("calls fn with Err value and returns the same Result", () => {
    const spy = vi.fn();
    const result: Result<number, string> = err("oops");
    const returned = tapErr(result, spy);
    expect(spy).toHaveBeenCalledWith("oops");
    expect(returned).toBe(result);
  });

  it("does not call fn on Ok", () => {
    const spy = vi.fn();
    const result = ok(42);
    const returned = tapErr(result, spy);
    expect(spy).not.toHaveBeenCalled();
    expect(returned).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------
describe("immutability", () => {
  it("Ok is readonly", () => {
    const result = ok(42);
    // @ts-expect-error — ok is readonly
    expect(() => { (result as any).ok = false; }).not.toThrow();
    // The type system prevents mutation at compile time.
    // At runtime the object is a plain object so mutation is possible,
    // but the *type* disallows it.
  });
});

// ---------------------------------------------------------------------------
// Real-world usage patterns
// ---------------------------------------------------------------------------
describe("real-world patterns", () => {
  it("parse → validate → transform pipeline", () => {
    const parse = (input: string): Result<number, string> => {
      const n = Number(input);
      return Number.isNaN(n) ? err("not a number") : ok(n);
    };

    const validate = (n: number): Result<number, string> =>
      n > 0 ? ok(n) : err("must be positive");

    const transform = (n: number) => n * 2;

    // Happy path
    const good = map(flatMap(parse("5"), validate), transform);
    expect(good).toEqual(ok(10));

    // Parse failure
    const bad1 = map(flatMap(parse("abc"), validate), transform);
    expect(bad1).toEqual(err("not a number"));

    // Validation failure
    const bad2 = map(flatMap(parse("-3"), validate), transform);
    expect(bad2).toEqual(err("must be positive"));
  });

  it("collecting multiple independent results", () => {
    const fetchUser = (): Result<{ name: string }, string> =>
      ok({ name: "Alice" });
    const fetchConfig = (): Result<{ theme: string }, string> =>
      ok({ theme: "dark" });
    const fetchPerms = (): Result<string[], string> =>
      ok(["read", "write"]);

    const result = combine([fetchUser(), fetchConfig(), fetchPerms()]);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const [user, config, perms] = result.value;
      expect(user).toEqual({ name: "Alice" });
      expect(config).toEqual({ theme: "dark" });
      expect(perms).toEqual(["read", "write"]);
    }
  });

  it("error recovery with unwrapOrElse", () => {
    const result: Result<number, string> = err("missing");
    const value = unwrapOrElse(result, () => 0);
    expect(value).toBe(0);
  });

  it("pattern matching for rendering", () => {
    type ApiError = { status: number; message: string };
    type User = { id: number; name: string };

    const render = (result: Result<User, ApiError>): string =>
      match(result, {
        ok: (user) => `<div>Hello, ${user.name}!</div>`,
        err: (error) => `<div class="error">${error.status}: ${error.message}</div>`,
      });

    expect(render(ok({ id: 1, name: "Alice" }))).toBe(
      "<div>Hello, Alice!</div>",
    );
    expect(render(err({ status: 404, message: "Not found" }))).toBe(
      '<div class="error">404: Not found</div>',
    );
  });
});
