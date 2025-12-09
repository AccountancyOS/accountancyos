import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Code2, ChevronDown } from "lucide-react";
import { getAvailablePlaceholders } from "@/lib/placeholder-resolver";

interface PlaceholderPickerProps {
  onInsert: (placeholder: string) => void;
  disabled?: boolean;
}

export function PlaceholderPicker({ onInsert, disabled }: PlaceholderPickerProps) {
  const [open, setOpen] = useState(false);
  const placeholderGroups = getAvailablePlaceholders();

  const handleSelect = (placeholder: string) => {
    onInsert(placeholder);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 gap-1"
        >
          <Code2 className="h-3.5 w-3.5" />
          Insert
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <ScrollArea className="h-80">
          <div className="p-2 space-y-3">
            {placeholderGroups.map((group) => (
              <div key={group.category}>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.category}
                </div>
                <div className="space-y-0.5">
                  {group.placeholders.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left"
                      onClick={() => handleSelect(p.key)}
                    >
                      <span className="font-medium">{p.label}</span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                        {p.key}
                      </code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
