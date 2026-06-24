## What's wrong today

`src/pages/settings/EngagementLetterVariants.tsx` shows the letter body in a plain `<Textarea>` so the user types and edits **raw HTML markup** — `<div style="...">`, `<p>`, `<a href="...">` etc. — with a tiny toolbar that just wraps the selection in tags. The right side renders a live HTML preview, which is the only place it looks like a letter. That's the screen in your screenshot.

## Fix

Replace the raw-HTML textarea with a **WYSIWYG editor that looks like a Word page**. The user just writes, formats, and drops in merge fields — they never see a tag. The stored value stays HTML in `engagement_letter_template_variants.body`, so every downstream consumer (signing page, emails, the existing variants you've already created) keeps working unchanged.

### Editor choice
**TipTap** (built on ProseMirror) — the standard React WYSIWYG, used in Notion-style editors, ships clean HTML. Install:

- `@tiptap/react`
- `@tiptap/starter-kit` (paragraph, bold, italic, headings, lists, blockquote, code, history, etc.)
- `@tiptap/extension-link`
- `@tiptap/extension-placeholder`

### UI changes inside the variant dialog
- Remove the split "Body | Live Preview" two-column layout.
- Drop in a full-width Word-style "page": white background, generous padding (~64px), max-width ~720px, centered, subtle shadow, serif/system body font, line-height ~1.7 — mirrors a printed letter. Dark mode keeps the page surface light so the letter always looks like paper.
- Sticky toolbar at the top of the page with: **Bold, Italic, Underline, H1, H2, Bullet list, Numbered list, Link, Insert Field ▾, Undo, Redo**. Active state highlights when caret is inside that mark.
- "Insert Field" dropdown reuses the existing `PLACEHOLDERS` array; inserting a field drops a styled inline chip (e.g. a subtle pill rendered from `{{firm.name}}`) so users see what's a variable vs prose, but the saved HTML is still plain `{{firm.name}}` text — no schema change.
- Replace the live preview pane with a **"Preview with sample data"** button that opens a read-only modal showing the rendered letter with placeholders substituted (reuses today's `renderPlaceholders` helper).

### Migration of existing variants
- TipTap accepts HTML directly via `editor.commands.setContent(body)`, so the engagement letter already in the screenshot loads into the new editor as a formatted letter on first open. No data migration, no edge-function changes.
- The existing `<style="…">` inline CSS from older bodies is preserved on load and round-trips through TipTap; we don't strip it.

### Files touched
- `src/pages/settings/EngagementLetterVariants.tsx` — swap textarea + toolbar + preview pane for the new editor component.
- `src/components/engagement-letter/LetterEditor.tsx` *(new)* — the TipTap editor + Word-style page + toolbar + Insert Field dropdown.
- `package.json` — add the four TipTap packages above (via `bun add`).

No DB migration. No edge-function changes. No changes to `engagement-change-service`, signing pages, or onboarding flow.

### Out of scope
- Tables, images, font pickers, page breaks, multi-page rendering — these don't fit the "simple Word-like letter" the user asked for and would expand scope.
- A from-scratch letter builder UI (sectioned drag-and-drop, clause library, etc.).
- Touching the variant-selection logic (engagement_kind / client_type / service_code / legal_entity filters stay exactly as they are).
- The Email template editor elsewhere in the app — only the engagement letter variants screen is in scope here.
