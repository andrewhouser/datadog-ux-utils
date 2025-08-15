/**
 * @file circuitBreaker.ts
 * @description Implements a circuit breaker pattern to protect API calls from repeated failures and overloads.
 */
import { addAction } from "../datadog.ts";

/**
 * Possible states for a circuit breaker.
 * - "closed": normal operation
 * - "open": requests are blocked due to repeated failures
 * - "half": limited requests allowed to test recovery
 */
type State = "closed" | "open" | "half";
/**
 * Default configuration for circuit breakers.
 * - `failureThreshold`: Number of failures before opening the circuit.
 * - `cooldownMs`: Time to wait before allowing requests after opening.
 * - `halfOpenMax`: Number of requests allowed in half-open state.
 */
const defaults = { failureThreshold: 5, cooldownMs: 10000, halfOpenMax: 2 };

/**
 * Internal map of breaker instances by key.
 */
const breakers = new Map<
  string,
  {
    state: State;
    failures: number;
    nextTry: number;
    halfOpenInFlight: number;
    cfg: Required<BreakerCfg>;
  }
>();

/**
 * Configuration options for the circuit breaker utility.
 *
 * @property failureThreshold - Number of failures before opening the circuit.
 * @property cooldownMs - Time to wait before allowing requests after opening.
 * @property halfOpenMax - Number of requests allowed in half-open state.
 */
export type BreakerCfg = typeof defaults;

/**
 * Wraps an async operation with a circuit breaker.
 *
 * @template T
 * @param key - Unique key for the breaker instance (e.g., "GET:/api/patients").
 * @param fn - Function returning a Promise to protect.
 * @param cfg - Partial breaker configuration (optional).
 * @returns The resolved value from the operation, or throws if the breaker is open.
 *
 * @example
 * // Protect a fetch call with a circuit breaker
 * const result = await wrapWithBreaker('GET:/api/patients', () => fetch('/api/patients'));
 *
 * @example
 * // Custom thresholds
 * const data = await wrapWithBreaker('POST:/api/orders', () => postOrder(), { failureThreshold: 3, cooldownMs: 5000 });
 */
export async function wrapWithBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  cfg: Partial<BreakerCfg> = {}
) {
  const b = getBreaker(key, cfg);
  const now = Date.now();

  if (b.state === "open") {
    if (now < b.nextTry) {
      throw mkErr("open", key, b.nextTry);
    } else {
      b.state = "half";
      b.halfOpenInFlight = 0;
      addAction("api_circuit_half_open", { key });
    }
  }
  if (b.state === "half" && b.halfOpenInFlight >= b.cfg.halfOpenMax) {
    throw mkErr("half-saturated", key, b.nextTry);
  }

  if (b.state === "half") b.halfOpenInFlight++;

  try {
    const res = await fn();
    onSuccess(b, key);
    return res;
  } catch (e) {
    onFailure(b, key);
    throw e;
  } finally {
    if (b.state === "half") b.halfOpenInFlight--;
  }
}

/**
 * Gets or creates a breaker instance for the given key.
 * @param key - Unique breaker key.
 * @param cfg - Partial configuration to override defaults.
 * @returns The breaker instance.
 */
function getBreaker(key: string, cfg: Partial<BreakerCfg>) {
  let b = breakers.get(key);
  if (!b) {
    b = {
      state: "closed",
      failures: 0,
      nextTry: 0,
      halfOpenInFlight: 0,
      cfg: { ...defaults, ...cfg },
    };
    breakers.set(key, b);
  }
  return b;
}
/**
 * Handles a successful operation, resetting failures and closing the breaker if needed.
 * @param b - Breaker instance.
 * @param key - Breaker key.
 */
function onSuccess(b: ReturnType<typeof getBreaker>, key: string) {
  b.failures = 0;
  if (b.state !== "closed") {
    b.state = "closed";
    addAction("api_circuit_closed", { key });
  }
}
/**
 * Handles a failed operation, incrementing failures and opening the breaker if threshold is reached.
 * @param b - Breaker instance.
 * @param key - Breaker key.
 */
function onFailure(b: ReturnType<typeof getBreaker>, key: string) {
  b.failures++;
  if (b.state === "half" || b.failures >= b.cfg.failureThreshold) {
    b.state = "open";
    b.nextTry = Date.now() + b.cfg.cooldownMs;
    addAction("api_circuit_open", { key, cooldown_ms: b.cfg.cooldownMs });
  }
}
/**
 * Creates a circuit breaker error with a descriptive message.
 * @param state - Breaker state ("open", "half-saturated", etc.).
 * @param key - Breaker key.
 * @param until - Timestamp until which the breaker remains open.
 * @returns Error instance.
 */
function mkErr(state: string, key: string, until: number) {
  const e = new Error(
    `Circuit ${state} for ${key} until ${new Date(until).toISOString()}`
  );
  e.name = "ApiCircuitOpenError";
  return e;
}
