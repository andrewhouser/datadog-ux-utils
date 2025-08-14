import { useCallback, useMemo, useRef, useEffect } from "react";
import { ApiRateGuard, ApiRunawayBlockedError } from "../api/rateGuard";

export type UseGuardedFetchOptions = {
  onBlocked?: (info: {
    key: string;
    until: number;
    windowMs: number;
    maxRequests: number;
  }) => void;

  /**
   * If 'wait', automatically retry once after the block window ends.
   * If 'none', do not retry.
   * Default: 'none'
   */
  retryAfter?: "wait" | "none";

  /**
   * Optional signal to cancel the auto-retry wait (e.g., route change)
   */
  cancelSignal?: AbortSignal;
};

/**
 * A thin wrapper that uses ApiRateGuard for fetch() calls and
 * gives you a single place to react to runaway bursts.
 *
 * Usage:
 *   const guardedFetch = useGuardedFetch(apiGuard, { onBlocked: showToast });
 *   const resp = await guardedFetch('/api/items');
 */
export function useGuardedFetch(
  guard: ApiRateGuard,
  opts?: UseGuardedFetchOptions
) {
  const retryAfter = opts?.retryAfter ?? "none";
  const cancelRef = useRef<AbortSignal | null>(opts?.cancelSignal ?? null);

  useEffect(() => {
    cancelRef.current = opts?.cancelSignal ?? null;
  }, [opts?.cancelSignal]);

  const wait = useCallback(async (ms: number) => {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      const sig = cancelRef.current;
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (sig) {
        if (sig.aborted) return onAbort();
        sig.addEventListener("abort", onAbort, { once: true });
      }
    });
  }, []);

  const guardedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        return await guard.guardFetch(input, init);
      } catch (e) {
        if (e instanceof ApiRunawayBlockedError) {
          opts?.onBlocked?.({
            key: e.key,
            until: e.until,
            windowMs: e.windowMs,
            maxRequests: e.maxRequests,
          });

          if (retryAfter === "wait") {
            const delay = e.until - Date.now();
            try {
              await wait(delay);
              // After the block, try once more (still guarded)
              return await guard.guardFetch(input, init);
            } catch (abortErr) {
              // If aborted, surface a clean error or rethrow
              throw abortErr;
            }
          }
        }
        throw e;
      }
    },
    [guard, retryAfter, wait, opts]
  );

  return useMemo(() => guardedFetch, [guardedFetch]);
}
