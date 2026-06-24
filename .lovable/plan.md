## Remove the redundant Preview card from the template editor

With the WYSIWYG editor now rendering the body exactly as it will appear, the sidebar "Preview" card in `src/components/templates/EmailTemplateEditor.tsx` is redundant.

### Change
- Delete the `<Card>` containing the Preview (subject + body preview) at the bottom of the right-hand sidebar. Keep the Merge Fields and Questionnaire Links cards.

### Out of scope
- No changes to the editor, merge-field logic, or any other screen.

### Files
- `src/components/templates/EmailTemplateEditor.tsx` (edit)
