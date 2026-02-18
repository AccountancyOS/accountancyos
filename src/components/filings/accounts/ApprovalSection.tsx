import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Approval {
  approved_by_board: boolean;
  approval_date?: string;
  signatory_name?: string;
  signatory_role?: string;
}

interface ApprovalSectionProps {
  approval: Approval;
  onChange: (a: Approval) => void;
  readonly: boolean;
}

export function ApprovalSection({ approval, onChange, readonly }: ApprovalSectionProps) {
  const patch = (p: Partial<Approval>) => onChange({ ...approval, ...p });

  return (
    <div className="space-y-4 max-w-md">
      <div className="flex items-center gap-3">
        <Switch checked={approval.approved_by_board} onCheckedChange={(v) => patch({ approved_by_board: v })} disabled={readonly} />
        <Label>Approved by the Board of Directors</Label>
      </div>
      <div>
        <Label>Approval Date</Label>
        <Input type="date" value={approval.approval_date || ''} onChange={(e) => patch({ approval_date: e.target.value })} disabled={readonly} className="mt-1" />
      </div>
      <div>
        <Label>Signatory Name</Label>
        <Input value={approval.signatory_name || ''} onChange={(e) => patch({ signatory_name: e.target.value })} disabled={readonly} className="mt-1" placeholder="e.g. John Smith" />
      </div>
      <div>
        <Label>Signatory Role</Label>
        <Input value={approval.signatory_role || 'Director'} onChange={(e) => patch({ signatory_role: e.target.value })} disabled={readonly} className="mt-1" />
      </div>
    </div>
  );
}
