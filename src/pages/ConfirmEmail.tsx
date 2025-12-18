import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Mail, Loader2, ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";

const ConfirmEmail = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checkingSession, setCheckingSession] = useState(true);

  const email = searchParams.get('email') || '';

  // Check if user is already confirmed (has valid session)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // User is confirmed, redirect
        navigate('/');
      }
      setCheckingSession(false);
    };
    checkSession();

    // Listen for auth state changes (user confirms email in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResendEmail = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: "Email sent",
        description: "Please check your inbox for the confirmation link.",
      });

      setCooldown(30); // 30 second cooldown
    } catch (error: any) {
      toast({
        title: "Error sending email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <div className="flex justify-center">
            <div className="bg-primary/10 p-4 rounded-full">
              <Mail className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Check Your Email</CardTitle>
          <CardDescription className="text-base">
            We've sent a confirmation link to:
          </CardDescription>
          {email && (
            <p className="font-medium text-foreground">{email}</p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="mb-2">
              <strong>What to do:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open your email inbox</li>
              <li>Find the email from AccountancyOS</li>
              <li>Click the confirmation link</li>
              <li>You'll be automatically signed in</li>
            </ol>
          </div>

          <Button
            onClick={handleResendEmail}
            variant="outline"
            className="w-full"
            disabled={resending || cooldown > 0}
          >
            {resending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resend in {cooldown}s
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resend Confirmation Email
              </>
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>Didn't receive the email? Check your spam folder.</p>
          </div>

          <div className="border-t pt-4">
            <Button
              onClick={() => navigate('/auth')}
              variant="ghost"
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Wrong email? Start over
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfirmEmail;
