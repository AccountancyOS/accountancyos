import React, { useMemo } from "react";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";

interface SafeEmailHtmlProps {
  html: string | null | undefined;
  className?: string;
}

export function SafeEmailHtml({ html, className }: SafeEmailHtmlProps) {
  const sanitized = useMemo(() => sanitizeEmailHtml(html), [html]);

  if (!sanitized) {
    return null;
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
