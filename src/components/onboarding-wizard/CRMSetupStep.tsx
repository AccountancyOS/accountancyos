import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";

interface CRMSetupStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const CRMSetupStep = ({ organizationId, onComplete, onSkip }: CRMSetupStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // CRM is built-in, so we just acknowledge the setup
      toast({
        title: "CRM ready",
        description: "Your built-in CRM is ready to use.",
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Built-in CRM</CardTitle>
          </div>
          <CardDescription>
            AccountancyOS includes a powerful built-in CRM system for managing leads, opportunities, and client relationships
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-semibold text-sm">Features included:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Lead capture and management</li>
              <li>Pipeline tracking with custom stages</li>
              <li>Activity logging and task management</li>
              <li>Quote generation directly from leads</li>
              <li>Automated onboarding workflows</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            No external CRM integration needed - everything is built right in and ready to use!
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up...
            </>
          ) : (
            "Continue to Next Step"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
      </div>
    </form>
  );
};
