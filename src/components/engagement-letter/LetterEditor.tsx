import { useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2,
  List, ListOrdered, Link as LinkIcon, Undo2, Redo2, Variable,
} from "lucide-react";

interface PlaceholderOpt { key: string; label: string }

interface LetterEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholders: PlaceholderOpt[];
}

function ToolbarBtn({
  onClick, active, title, children,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="h-8 w-8"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Toolbar({ editor, placeholders }: { editor: Editor; placeholders: PlaceholderOpt[] }) {
  const addLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background/95 px-2 py-1.5 backdrop-blur">
      <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarBtn>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Numbered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Link" active={editor.isActive("link")} onClick={addLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarBtn>
      <div className="mx-1 h-5 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs">
            <Variable className="h-3.5 w-3.5" /> Insert Field
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {placeholders.map((p) => (
            <DropdownMenuItem
              key={p.key}
              onClick={() => editor.chain().focus().insertContent(`{{${p.key}}}`).run()}
            >
              {p.label}
              <span className="ml-auto text-xs text-muted-foreground">{`{{${p.key}}}`}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolbarBtn>
      </div>
    </div>
  );
}

export function LetterEditor({ value, onChange, placeholders }: LetterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener", target: "_blank" } }),
      Placeholder.configure({ placeholder: "Write the engagement letter as you would in Word…" }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "letter-editor-prose focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep editor in sync when caller swaps the variant being edited.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rounded-md border bg-muted/30">
      <Toolbar editor={editor} placeholders={placeholders} />
      <div className="max-h-[60vh] overflow-y-auto px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-[720px] rounded-sm bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200">
          <div className="px-12 py-14 md:px-16 md:py-16">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LetterEditor;