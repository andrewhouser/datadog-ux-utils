/**
 * @file useGuardedCall.ts
 * @description React hook for guarded async calls with rate limiting and optional auto-retry.
 */
import { useCallback, useMemo } from "react";
import { ApiRateGuard, ApiRunawayBlockedError } from "../api/rateGuard.ts";

export type UseGuardedCallOptions = {
  onBlocked?: (info: {
    key: string;
    until: number;
    windowMs: number;
    maxRequests: number;
  }) => void;
  retryAfter?: "wait" | "none";
};

/**
 * Guard any async call (Axios, graphql, SDK).
 *
 * Usage:
 *   const guardedCall = useGuardedCall(apiGuard, { onBlocked: toast });
 *   const data = await guardedCall('POST /api/orders', () => axios.post(...));
 */
export function useGuardedCall(
  guard: ApiRateGuard,
  opts?: UseGuardedCallOptions
) {
  const retryAfter = opts?.retryAfter ?? "none";

  const fn = useCallback(
    async <T>(key: string, call: () => Promise<T>) => {
      try {
        return await guard.guard(key, call);
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
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
            return guard.guard(key, call);
          }
        }
        throw e;
      }
    },
    [guard, retryAfter, opts]
  );

  return useMemo(() => fn, [fn]);
}
