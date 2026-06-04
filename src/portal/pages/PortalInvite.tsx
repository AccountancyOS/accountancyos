import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Token-based invite acceptance.
 * Calls the existing `accept-portal-invite-signup` edge function with
 * { token, password, name }. On success, signs the user in and lands them
 * on the dashboard.
 */
export default function PortalInvite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "accept-portal-invite-signup",
        { body: { token, password, name } },
      );
      if (error) throw error;
      const status = (data as { status?: string } | null)?.status;
      if (status && status !== "ok" && status !== "success") {
        const message = (data as { message?: string } | null)?.message ?? "Invite cannot be accepted.";
        throw new Error(message);
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      navigate("/portal/dashboard", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to accept invite.");
    } finally {
      setSubmitting(false);
    }
  };

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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  Use the email that received the invitation.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose A Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Setting Up…" : "Accept Invite"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}