/**
 * Global error overlay (diagnostic).
 *
 * React error boundaries only catch errors thrown during render of components
 * BELOW them — they miss async errors, event-handler errors, and module-load
 * errors, any of which can leave a blank page. This installs window-level
 * `error` / `unhandledrejection` listeners that paint the error into a fixed DOM
 * banner using raw DOM (no React), so it remains visible even when the React
 * tree has rendered nothing. Lets a non-technical user read the real error back.
 */
function paint(title: string, detail: string) {
  try {
    if (typeof document === "undefined" || !document.body) return;
    let el = document.getElementById("__aos_err_overlay__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__aos_err_overlay__";
      el.style.cssText = [
        "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
        "background:#7f1d1d", "color:#fff", "font:12px/1.5 ui-monospace,Menlo,monospace",
        "padding:10px 40px 10px 12px", "white-space:pre-wrap", "word-break:break-word",
        "max-height:55vh", "overflow:auto", "box-shadow:0 2px 10px rgba(0,0,0,.45)",
      ].join(";");
      const close = document.createElement("button");
      close.textContent = "×";
      close.setAttribute("aria-label", "Dismiss");
      close.style.cssText =
        "position:absolute;top:4px;right:8px;background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer";
      close.onclick = () => el && el.remove();
      el.appendChild(close);
      const hdr = document.createElement("div");
      hdr.textContent = "App error (please screenshot / copy this):";
      hdr.style.cssText = "font-weight:bold;margin-bottom:4px";
      el.appendChild(hdr);
      document.body.appendChild(el);
    }
    const line = document.createElement("div");
    line.textContent = `• ${title}: ${detail}`;
    line.style.cssText = "margin-top:4px;user-select:text";
    el.appendChild(line);
  } catch {
    /* never let the reporter throw */
  }
}

function firstFrame(stack: unknown): string {
  if (typeof stack !== "string") return "";
  return (
    stack.split("\n").map((l) => l.trim()).find((l) => l.startsWith("at ")) || ""
  );
}

export function installGlobalErrorOverlay() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e: ErrorEvent) => {
    // Ignore resource (img/script/css) load errors — only JS runtime errors.
    if (!e.error && !e.message) return;
    const err = e.error as { message?: string; stack?: unknown } | undefined;
    const where = firstFrame(err?.stack) || `${e.filename}:${e.lineno}:${e.colno}`;
    paint("Error", `${e.message || err?.message || "unknown error"} — ${where}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: unknown } | string | undefined;
    const msg =
      typeof r === "string" ? r : r?.message || (() => { try { return JSON.stringify(r); } catch { return "unknown"; } })();
    paint("Unhandled promise rejection", `${msg} ${firstFrame((r as { stack?: unknown })?.stack)}`.trim());
  });
}
