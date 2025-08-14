import { addAction, addError } from "../datadog";
import { ResourceErrorOptions } from "../types/types";

type DedupeKey = string;

const DEFAULTS: Required<ResourceErrorOptions> = {
  sampleRate: 20,
  dedupeWindowMs: 60_000,
  maxPerMinute: 60,
  includeElementInfo: true,
  captureCspViolations: true,
  actionName: "resource_error",
  cspActionName: "csp_violation",
};

let installed = false;

/**
 * Capture failures of static assets (img/script/link for CSS/fonts, etc.) and CSP violations.
 * Reports are sampled, deduped, and rate limited. Returns an uninstall function.
 *
 * Implementation notes:
 * - Uses a window-level "error" listener in the capture phase so it catches resource errors
 *   that do not bubble (e.g., <img onerror>, <link> failures).
 * - Serializes only safe, compact details about the target element and URL.
 * - Adds a separate listener for "securitypolicyviolation" when enabled.
 *
 * @example
 * ```ts
 * import { captureResourceErrors } from "@milliman/datadog-ux-utils/errors/resourceErrors";
 *
 * const uninstall = captureResourceErrors({
 *   sampleRate: 25,
 *   dedupeWindowMs: 45_000,
 *   maxPerMinute: 30,
 *   captureCspViolations: true,
 * });
 *
 * // Later, when tearing down the app or test harness:
 * uninstall();
 * ```
 */
export function captureResourceErrors(options: ResourceErrorOptions = {}) {
  if (installed) return uninstall; // idempotent
  installed = true;

  const opts = { ...DEFAULTS, ...options };

  // Simple token bucket for per-minute rate limiting
  let tokens = opts.maxPerMinute;
  let lastRefill = Date.now();

  // Dedupe recent identical events for a limited window
  const recent = new Map<DedupeKey, number>(); // key -> timestamp

  const refill = () => {
    const now = Date.now();
    const elapsed = now - lastRefill;
    if (elapsed >= 60_000) {
      tokens = opts.maxPerMinute;
      lastRefill = now;
    }
  };

  const onError = (ev: Event) => {
    // Only handle resource errors from elements, not runtime JS errors
    // When window.onerror fires for scripts, it is an ErrorEvent; we ignore that here
    // because the ErrorBoundary and addError already handle application errors.
    const target = ev.target as Element | null;
    if (!target || !(target instanceof Element)) return;

    const tag = target.tagName.toLowerCase();
    if (!isResourceTag(tag)) return;

    const url = getResourceUrl(target);
    const key = makeKey(tag, url, "load_error");

    // Rate limit and dedupe
    if (!shouldReport(opts.sampleRate)) return;
    refill();
    if (tokens <= 0) return;
    if (isDuplicate(recent, key, opts.dedupeWindowMs)) return;

    tokens--;

    const payload: Record<string, unknown> = {
      tag,
      url,
      reason: "load_error",
    };

    if (opts.includeElementInfo) {
      payload.el = snapshotElement(target);
    }

    // Route via addAction (not addError) to keep grouping clean. If you prefer error grouping,
    // uncomment the addError line and remove addAction.
    try {
      addAction(opts.actionName, payload, opts.sampleRate);
      // addError(new Error(`[resource] ${tag} failed to load: ${url}`), payload, opts.sampleRate);
    } catch {
      // swallow
    }
  };

  const onCsp = (ev: SecurityPolicyViolationEvent) => {
    if (!opts.captureCspViolations) return;
    if (!shouldReport(opts.sampleRate)) return;

    refill();
    if (tokens <= 0) return;

    const violated = ev.effectiveDirective || ev.violatedDirective || "unknown";
    const blocked = ev.blockedURI || "unknown";
    const key = makeKey("csp", `${violated}:${blocked}`, "csp_violation");
    if (isDuplicate(recent, key, opts.dedupeWindowMs)) return;

    tokens--;

    const payload = {
      reason: "csp_violation",
      effectiveDirective: ev.effectiveDirective,
      blockedURI: ev.blockedURI,
      lineNumber: ev.lineNumber,
      sourceFile: ev.sourceFile,
      statusCode: ev.statusCode,
      sample: ev.sample,
      disposition: ev.disposition,
      originalPolicy: truncate(ev.originalPolicy ?? "", 512),
      referrer: (document && document.referrer) || undefined,
    };

    try {
      addAction(opts.cspActionName, payload, opts.sampleRate);
    } catch {
      // swallow
    }
  };

  // Install listeners
  window.addEventListener("error", onError, true);
  if (opts.captureCspViolations && supportsCspEvent()) {
    window.addEventListener("securitypolicyviolation", onCsp as any);
  }

  // Return uninstaller
  function uninstall() {
    if (!installed) return;
    installed = false;
    window.removeEventListener("error", onError, true);
    if (opts.captureCspViolations && supportsCspEvent()) {
      window.removeEventListener("securitypolicyviolation", onCsp as any);
    }
    recent.clear();
  }

  return uninstall;
}

/* ----------------------------- internals ----------------------------- */

function isResourceTag(tag: string) {
  // Common static asset nodes; <link> covers CSS and fonts, <img> images, <script> JS chunks.
  // You can add <video>, <audio>, <source> if desired.
  return tag === "img" || tag === "script" || tag === "link";
}

function getResourceUrl(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "img")
    return (
      (el as HTMLImageElement).currentSrc ||
      (el as HTMLImageElement).src ||
      null
    );
  if (tag === "script") return (el as HTMLScriptElement).src || null;
  if (tag === "link") return (el as HTMLLinkElement).href || null;
  return null;
}

function snapshotElement(el: Element) {
  const tag = el.tagName.toLowerCase();
  const out: Record<string, unknown> = { tag };

  // A carefully limited set of attributes for triage without leaking PII
  if (tag === "img") {
    const img = el as HTMLImageElement;
    out.loading = img.loading || undefined;
    out.decoding = (img as any).decoding || undefined;
    out.referrerPolicy = img.referrerPolicy || undefined;
    out.crossOrigin = img.crossOrigin || undefined;
    out.sizes = img.sizes || undefined;
    out.srcset = truncate(img.srcset || "", 256); // truncated to keep payload light
    out.width = img.width || undefined;
    out.height = img.height || undefined;
  } else if (tag === "script") {
    const s = el as HTMLScriptElement;
    out.async = !!s.async;
    out.defer = !!s.defer;
    out.type = s.type || undefined;
    out.crossOrigin = s.crossOrigin || undefined;
    out.referrerPolicy = (s as any).referrerPolicy || undefined;
    out.integrity = truncate(s.integrity || "", 128);
  } else if (tag === "link") {
    const l = el as HTMLLinkElement;
    out.rel = l.rel || undefined;
    out.as = (l as any).as || undefined;
    out.media = l.media || undefined;
    out.type = l.type || undefined;
    out.crossOrigin = l.crossOrigin || undefined;
    out.referrerPolicy = (l as any).referrerPolicy || undefined;
    out.sizes = (l as any).sizes || undefined;
    out.integrity = truncate(l.integrity || "", 128);
  }

  // A minimal selector to help locate the element without sending full DOM
  out.selector = buildSelector(el);

  return out;
}

function buildSelector(el: Element): string {
  try {
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && depth < 4) {
      const tag = node.tagName.toLowerCase();
      const id = node.id ? `#${node.id}` : "";
      const cls =
        node.classList && node.classList.length
          ? "." + Array.from(node.classList).slice(0, 2).join(".")
          : "";
      parts.unshift(tag + id + cls);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  } catch {
    return el.tagName.toLowerCase();
  }
}

function makeKey(tag: string, url: string | null, reason: string): DedupeKey {
  return `${reason}:${tag}:${url ?? "null"}`;
}

function isDuplicate(
  map: Map<DedupeKey, number>,
  key: DedupeKey,
  windowMs: number
) {
  const now = Date.now();
  const last = map.get(key);
  if (last && now - last < windowMs) return true;
  map.set(key, now);
  // Periodically clean old entries
  if (map.size > 2000) {
    for (const [k, ts] of map) {
      if (now - ts > windowMs) map.delete(k);
    }
  }
  return false;
}

function supportsCspEvent() {
  return "SecurityPolicyViolationEvent" in window;
}

function shouldReport(pct: number) {
  return Math.random() * 100 < clampPct(pct);
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
