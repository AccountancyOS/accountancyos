import DOMPurify from "dompurify";

// Configure hooks once at module load
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute("href") || "";
      // Block javascript: and other dangerous protocols
      if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
        node.removeAttribute("href");
      } else {
        // Enforce safe target=_blank with noopener noreferrer
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
}

/**
 * Sanitize email HTML content.
 * Email HTML is untrusted input - we sanitize aggressively.
 * - Remove scripts, event handlers, JS URLs
 * - Remove iframes/objects/embed
 * - Prevent reverse-tabnabbing
 */
export function sanitizeEmailHtml(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml) return "";
  
  return DOMPurify.sanitize(dirtyHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "link", "meta"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover", "onfocus", "onblur"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

/**
 * Sanitize footer HTML content (more restrictive for branding footers).
 */
export function sanitizeFooterHtml(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml) return "";
  
  return DOMPurify.sanitize(dirtyHtml, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ["p", "br", "strong", "em", "a", "span"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
