import type { Component } from "@earendil-works/pi-tui";

const BEGIN = "\x1b[?2026h", END = "\x1b[?2026l", HIDE = "\x1b[?25l", SHOW = "\x1b[?25h";

/** Instance-scoped adapter for the installed native Main/Alt renderers.
 * Decorate before traversal. Keep cursor movement INSIDE the same synchronized
 * update as the frame, including MainScreen's otherwise separate final move.
 * Buffer ordinary frames into one write; large scrollback paints stay bounded.
 * No core/prototype edits or persistent terminal-method overrides.
 */
export function installPaintGuard(root: Component, before: () => void, enabled: () => boolean): () => void {
  type Terminal = { write?: (data: string) => void; hideCursor?: () => void; showCursor?: () => void };
  type Host = Component & { doRender?: () => void; terminal?: Terminal };
  // Pi 1.0 supplies a forwarding TUI reference: every method read returns a new
  // bound thunk and own-property inspection sees its empty proxy target. Patching
  // that reference prevents identity-based cleanup and stacks wrappers on /new.
  // A temporary instance method obtains the actual receiver without accessing
  // private fields, changing prototypes or retaining a global renderer cache.
  const receiver = Symbol("pi-workspace:paint-receiver");
  const reference = root as Host & { [receiver]?: () => Host };
  reference[receiver] = function() { return this; };
  let host: Host;
  try { host = reference[receiver]!(); }
  finally {
    // Delete from the receiver, not the forwarding proxy's empty target.
    const actual = reference[receiver]?.();
    if (actual) delete (actual as typeof reference)[receiver];
  }
  const render = host.render, paint = host.doRender;
  const ownRender = Object.hasOwn(host, "render"), ownPaint = Object.hasOwn(host, "doRender");
  let active = true, painting = false;
  const prepare = () => { if (active && enabled()) before(); };
  const wrappedRender: Component["render"] = function(width) { if (!painting) prepare(); return render.call(host, width); };
  const wrappedPaint = function() {
    if (!active || !enabled() || painting) return paint?.call(host);
    prepare();
    const terminal = host.terminal, write = terminal?.write;
    if (!terminal || typeof write !== "function") return paint?.call(host);
    let buffer = "", carry = "", opened = false, wrote = false;
    const flush = (last: boolean) => {
      if (!buffer && !opened) return;
      const output = (opened ? "" : BEGIN + HIDE) + buffer + (last ? END : "");
      buffer = "";
      opened = true;
      write.call(terminal, output);
    };
    const capture = (data: string) => {
      // Native synchronization wrappers become one outer transaction, even
      // when MainScreen's bounded writer splits a wrapper across chunks.
      let body = (carry + data).replaceAll(BEGIN, "").replaceAll(END, "");
      carry = "";
      for (let length = Math.min(body.length, BEGIN.length - 1); length > 0; length--) {
        const tail = body.slice(-length);
        if (BEGIN.startsWith(tail) || END.startsWith(tail)) { carry = tail; body = body.slice(0, -length); break; }
      }
      if (!body) return;
      wrote = true;
      for (let start = 0; start < body.length;) {
        let end = Math.min(body.length, start + 32768);
        const last = body.charCodeAt(end - 1), next = body.charCodeAt(end);
        if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
        buffer += body.slice(start, end); start = end;
        if (buffer.length >= 65536) flush(false);
      }
    };
    const hide = () => capture(HIDE), show = () => capture(SHOW);
    const saved = (["write", "hideCursor", "showCursor"] as const).map(key => ({ key, value: terminal[key], own: Object.hasOwn(terminal, key) }));
    terminal.write = capture; terminal.hideCursor = hide; terminal.showCursor = show;
    painting = true;
    try { return paint?.call(host); }
    finally {
      painting = false;
      for (const { key, value, own } of saved) {
        if (terminal[key] !== (key === "write" ? capture : key === "hideCursor" ? hide : show)) continue;
        if (own) (terminal as Record<string, unknown>)[key] = value;
        else delete terminal[key];
      }
      // No output (stopped renderer / failed composition) means no hide/show
      // churn and no changed shell cursor. Always close a started transaction.
      if (carry) { buffer += carry; wrote = true; }
      if (wrote) flush(true);
    }
  };
  host.render = wrappedRender;
  if (typeof paint === "function") host.doRender = wrappedPaint;
  return () => {
    active = false;
    if (host.render === wrappedRender) { if (ownRender) host.render = render; else delete (host as unknown as { render?: unknown }).render; }
    if (host.doRender === wrappedPaint) { if (ownPaint) host.doRender = paint; else delete host.doRender; }
  };
}
