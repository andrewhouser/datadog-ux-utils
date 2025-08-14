import { addAction } from "../datadog";

type State = "closed" | "open" | "half";
const defaults = { failureThreshold: 5, cooldownMs: 10000, halfOpenMax: 2 };

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
 */
export type BreakerCfg = typeof defaults;

/**
 * Wraps an async operation with a circuit breaker.
 *
 * @param key - Unique key for the breaker instance.
 * @param fn - Function returning a Promise to protect.
 * @param cfg - Partial breaker configuration.
 * @returns The resolved value from the operation, or throws if the breaker is open.
 *
 * @example
 * // Protect a fetch call with a circuit breaker
 * const result = await wrapWithBreaker('GET:/api/patients', () => fetch('/api/patients'));
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
function onSuccess(b: ReturnType<typeof getBreaker>, key: string) {
  b.failures = 0;
  if (b.state !== "closed") {
    b.state = "closed";
    addAction("api_circuit_closed", { key });
  }
}
function onFailure(b: ReturnType<typeof getBreaker>, key: string) {
  b.failures++;
  if (b.state === "half" || b.failures >= b.cfg.failureThreshold) {
    b.state = "open";
    b.nextTry = Date.now() + b.cfg.cooldownMs;
    addAction("api_circuit_open", { key, cooldown_ms: b.cfg.cooldownMs });
  }
}
function mkErr(state: string, key: string, until: number) {
  const e = new Error(
    `Circuit ${state} for ${key} until ${new Date(until).toISOString()}`
  );
  e.name = "ApiCircuitOpenError";
  return e;
}
