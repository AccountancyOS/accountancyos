import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCheck, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProfessionalClearanceSectionProps {
  onboardingId: string;
  previousAccountantRequired: boolean;
  previousAccountantFirmName: string | null;
  previousAccountantEmail: string | null;
  clearanceReceived: boolean;
  clearanceReceivedAt: string | null;
  clearanceNotes: string | null;
  onUpdate: () => void;
}

export function ProfessionalClearanceSection({
  onboardingId,
  previousAccountantRequired,
  previousAccountantFirmName,
  previousAccountantEmail,
  clearanceReceived,
  clearanceReceivedAt,
  clearanceNotes,
  onUpdate,
}: ProfessionalClearanceSectionProps) {
  const [saving, setSaving] = useState(false);
  const [localClearanceReceived, setLocalClearanceReceived] = useState(clearanceReceived);
  const [localNotes, setLocalNotes] = useState(clearanceNotes || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("onboarding_applications")
        .update({
          clearance_received: localClearanceReceived,
          clearance_received_at: localClearanceReceived ? new Date().toISOString() : null,
          clearance_notes: localNotes || null,
        })
        .eq("id", onboardingId);

      if (error) throw error;

      toast.success("Clearance status updated");
      onUpdate();
    } catch (error: any) {
      console.error("Error updating clearance:", error);
      toast.error(error.message || "Failed to update clearance status");
    } finally {
      setSaving(false);
    }
  };

  if (!previousAccountantRequired) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">Professional Clearance</CardTitle>
            </div>
            <Badge variant="secondary">
              <Info className="h-3 w-3 mr-1" />
              Not Required
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No previous accountant - professional clearance is not required.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Professional Clearance</CardTitle>
          </div>
          {clearanceReceived ? (
            <Badge variant="default" className="bg-green-600">Received</Badge>
          ) : (
            <Badge variant="outline">Pending</Badge>
          )}
        </div>
        <CardDescription>
          Track professional clearance from previous accountant (non-blocking)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Previous Accountant Info */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <p className="text-sm font-medium">Previous Accountant</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Firm:</span>
              <p>{previousAccountantFirmName || "Not provided"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Email:</span>
              <p>{previousAccountantEmail || "Not provided"}</p>
            </div>
          </div>
        </div>

        {/* Clearance Status */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="clearance-received"
              checked={localClearanceReceived}
              onCheckedChange={(checked) => setLocalClearanceReceived(checked === true)}
            />
            <Label htmlFor="clearance-received">Clearance received</Label>
          </div>

          {clearanceReceivedAt && (
            <p className="text-xs text-muted-foreground">
              Received on: {format(new Date(clearanceReceivedAt), "PPp")}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="clearance-notes">Notes (optional)</Label>
            <Textarea
              id="clearance-notes"
              placeholder="Any notes about the clearance process..."
              value={localNotes}
              onChange={(e) => setLocalNotes(e.target.value)}
              rows={2}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            variant="outline"
            size="sm"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Note: Clearance is not required to approve the onboarding application.
        </p>
      </CardContent>
    </Card>
  );
}
