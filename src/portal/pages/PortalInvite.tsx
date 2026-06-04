import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Token-based invite acceptance.
 * Batch 1: renders the shell. Batch 2 wires the server-side token validation
 * + signup flow via an edge function.
 */
export default function PortalInvite() {
  const [params] = useSearchParams();
  const token = params.get("token");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept Invite</CardTitle>
          <CardDescription>Complete your client portal setup.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <Alert variant="destructive">
              <AlertDescription>
                Missing invite token. Please use the link sent in your invitation email.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertDescription>
                Invite acceptance is being prepared. If this message persists,
                please contact your accountant.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}