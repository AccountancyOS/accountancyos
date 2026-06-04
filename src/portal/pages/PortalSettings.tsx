import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { usePortalEntity } from "../contexts/PortalEntityContext";

export default function PortalSettings() {
  const { ctx, currentEntity } = usePortalEntity();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const handlePasswordChange = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password updated.");
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PortalPageHeader title="Profile & Settings" description="Manage your portal profile." />

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-medium">Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium mt-1">{ctx.email}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Entity</Label>
              <p className="text-sm font-medium mt-1">
                {currentEntity?.displayName ?? "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-base font-medium">Change Password</h2>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handlePasswordChange} disabled={saving}>
              {saving ? "Saving…" : "Update Password"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}