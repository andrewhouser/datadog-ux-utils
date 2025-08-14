export type Flags = {
  telemetryEnabled: boolean;
  guardEnabled: boolean;
};

let flags: Flags = {
  telemetryEnabled: true,
  guardEnabled: true,
};

type Sub = (f: Flags) => void;
const subs = new Set<Sub>();

export function getFlags(): Flags {
  return flags;
}

export function setFlags(next: Partial<Flags>) {
  flags = { ...flags, ...next };
  subs.forEach((s) => s(flags));
}

export function subscribeFlags(cb: Sub) {
  subs.add(cb);
  return () => subs.delete(cb);
}

/**
 * Optional: read initial flags from global or localStorage
 * Call once in your app bootstrap before initDatadogUx()
 */
export function bootstrapFlags() {
  try {
    // window.__DD_UX_FLAGS__ = { telemetryEnabled: false, guardEnabled: false }
    const w: any = typeof window !== "undefined" ? window : undefined;
    if (w && w.__DD_UX_FLAGS__) setFlags(w.__DD_UX_FLAGS__);

    const ls = typeof window !== "undefined" ? window.localStorage : null;
    if (ls) {
      const raw = ls.getItem("dd_ux_flags");
      if (raw) setFlags(JSON.parse(raw));
      // persist on change
      subscribeFlags((f) => ls.setItem("dd_ux_flags", JSON.stringify(f)));
    }
  } catch {
    // ignore
  }
}
