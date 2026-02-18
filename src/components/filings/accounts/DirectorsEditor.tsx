import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface Director {
  name: string;
  appointed_date?: string;
  resigned_date?: string;
}

interface DirectorsEditorProps {
  directors: Director[];
  onChange: (d: Director[]) => void;
  readonly: boolean;
}

export function DirectorsEditor({ directors, onChange, readonly }: DirectorsEditorProps) {
  const add = () => onChange([...directors, { name: '' }]);
  const remove = (i: number) => onChange(directors.filter((_, j) => j !== i));
  const update = (i: number, patch: Partial<Director>) => {
    const next = [...directors];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">At least one director is required.</p>
      {directors.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input placeholder="Director name" value={d.name} onChange={(e) => update(i, { name: e.target.value })} disabled={readonly} className="flex-1" />
          <Input type="date" value={d.appointed_date || ''} onChange={(e) => update(i, { appointed_date: e.target.value })} disabled={readonly} className="w-40" placeholder="Appointed" />
          <Input type="date" value={d.resigned_date || ''} onChange={(e) => update(i, { resigned_date: e.target.value })} disabled={readonly} className="w-40" placeholder="Resigned" />
          {!readonly && <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      {!readonly && <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add Director</Button>}
    </div>
  );
}
