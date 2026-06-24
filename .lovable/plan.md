## Replace the templates email editor with the Word-style WYSIWYG editor

The "Email Body" editor in `src/components/templates/EmailTemplateEditor.tsx` is still a monospace `<Textarea>` showing raw `{{merge_tags}}` — the exact same problem the engagement letter editor had before. Bring it in line with the WYSIWYG editor already used for engagement letter variants.

### Changes

1. **`src/components/templates/EmailTemplateEditor.tsx`** — Replace the Rich Text `<Textarea>` with the existing `LetterEditor` component (`src/components/engagement-letter/LetterEditor.tsx`).
   - Map `mergeFields` → `placeholders` prop so the editor's "Insert Field" dropdown shows the same categorized list. The sidebar "Merge Fields" badges stay (they append to body).
   - Keep the HTML tab as a raw `<Textarea>` for power users.
   - Remove the `font-mono` look; the editor renders proper paragraphs, bold/italic/lists/links toolbar, and styled merge-field chips.
   - Update the Preview card to render the body via `dangerouslySetInnerHTML` inside the same white letter-style box used in `EngagementLetterVariants`.

2. **Body storage stays HTML.** Existing plain-text bodies still render (TipTap accepts them); new edits save HTML. No migration or backend change.

3. **Out of scope:** Touching the HTML tab editor, merge-field schema, send pipeline, or any other settings screen. Only the templates editor UI changes.

### Files
- `src/components/templates/EmailTemplateEditor.tsx` (edit)
