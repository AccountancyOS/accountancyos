import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  clearWizardDraft,
  loadWizardDraft,
  useWizardDraft,
} from "./useWizardDraft";

interface PracticeSetupStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

const TIMEZONES = [
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
];

const STEP_KEY = "practice_setup";

type PracticeSetupForm = {
  timezone: string;
  emailDomain: string;
};

const DEFAULT_FORM: PracticeSetupForm = {
  timezone: "Europe/London",
  emailDomain: "",
};

export const PracticeSetupStep = ({ organizationId, onComplete, onSkip }: PracticeSetupStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const initial =
    loadWizardDraft<PracticeSetupForm>(STEP_KEY, organizationId) ?? DEFAULT_FORM;
  const [timezone, setTimezone] = useState(initial.timezone);
  const [emailDomain, setEmailDomain] = useState(initial.emailDomain);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("timezone, email_domain")
        .eq("id", organizationId)
        .maybeSingle();
      if (cancelled || !data) return;
      // Fill blanks from DB; preserve any draft value already present.
      setTimezone((curr) => curr || data.timezone || "Europe/London");
      setEmailDomain((curr) => curr || data.email_domain || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useWizardDraft<PracticeSetupForm>(STEP_KEY, organizationId, {
    timezone,
    emailDomain,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          timezone,
          email_domain: emailDomain || null,
        })
        .eq("id", organizationId);

      if (error) throw error;

      toast({
        title: "Practice setup saved",
        description: "Your timezone and domain preferences have been saved.",
      });

      clearWizardDraft(STEP_KEY, organizationId);
      onComplete();
    } catch (error: any) {
      toast({
        title: "Error saving setup",
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
        <div className="space-y-2">
          <Label htmlFor="timezone">Practice Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            This will be used for deadline calculations and scheduling
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email_domain">Email Domain (Optional)</Label>
          <Input
            id="email_domain"
            value={emailDomain}
            onChange={(e) => setEmailDomain(e.target.value)}
            placeholder="yourfirm.com"
          />
          <p className="text-sm text-muted-foreground">
            Used for team member email validation when inviting staff
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Continue"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
      </div>
    </form>
  );
};
