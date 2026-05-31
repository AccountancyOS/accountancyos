import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, X } from "lucide-react";
import {
  clearWizardDraft,
  loadWizardDraft,
  useWizardDraft,
} from "./useWizardDraft";

interface TeamSetupStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface TeamMember {
  email: string;
  role: "admin" | "staff";
}

const STEP_KEY = "team_setup";

type TeamDraft = {
  members: TeamMember[];
  newEmail: string;
  newRole: "admin" | "staff";
};

const DEFAULT_DRAFT: TeamDraft = { members: [], newEmail: "", newRole: "staff" };

export const TeamSetupStep = ({ organizationId, onComplete, onSkip }: TeamSetupStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const initial =
    loadWizardDraft<TeamDraft>(STEP_KEY, organizationId) ?? DEFAULT_DRAFT;
  const [members, setMembers] = useState<TeamMember[]>(initial.members);
  const [newEmail, setNewEmail] = useState(initial.newEmail);
  const [newRole, setNewRole] = useState<"admin" | "staff">(initial.newRole);

  useWizardDraft<TeamDraft>(STEP_KEY, organizationId, {
    members,
    newEmail,
    newRole,
  });

  const handleAddMember = () => {
    if (!newEmail) return;

    if (members.some(m => m.email === newEmail)) {
      toast({
        title: "Duplicate email",
        description: "This email has already been added",
        variant: "destructive",
      });
      return;
    }

    setMembers([...members, { email: newEmail, role: newRole }]);
    setNewEmail("");
    setNewRole("staff");
  };

  const handleRemoveMember = (email: string) => {
    setMembers(members.filter(m => m.email !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (members.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const invitations = members.map(member => ({
          organization_id: organizationId,
          email: member.email,
          role: member.role,
          invited_by: user.id,
        }));

        const { error } = await supabase
          .from("team_invitations")
          .insert(invitations);

        if (error) throw error;

        toast({
          title: "Invitations created",
          description: `${members.length} team member${members.length > 1 ? 's' : ''} will receive invitation emails.`,
        });
      }

      clearWizardDraft(STEP_KEY, organizationId);
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error sending invitations",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="colleague@firm.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "staff")}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="button" onClick={handleAddMember} variant="outline" className="w-full">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Team Member
              </Button>
            </div>
          </CardContent>
        </Card>

        {members.length > 0 && (
          <div className="space-y-2">
            <Label>Team Members to Invite ({members.length})</Label>
            {members.map((member) => (
              <Card key={member.email}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{member.email}</p>
                    <p className="text-sm text-muted-foreground capitalize">{member.role}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(member.email)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            members.length > 0 ? "Send Invitations & Continue" : "Continue"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
      </div>
    </form>
  );
};
