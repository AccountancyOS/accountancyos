import { useState, useEffect } from "react";
import { lovable } from "@/integrations/lovable/index";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { ensureOrganization, setPendingOrgName } from "@/lib/ensure-organization";
import { getAppUrl } from "@/lib/app-config";

type AuthMode = "signin" | "signup" | "forgot" | "reset-password";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { setAuthFlow } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Handle password recovery detection
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          console.debug('[Auth] PASSWORD_RECOVERY event detected');
          setMode("reset-password");
          setAuthFlow("recovery");
        }
      }
    );

    // Also check URL hash on mount for recovery tokens
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      console.debug('[Auth] Recovery hash detected in URL');
      // Verify there's a valid session with the recovery token
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setMode("reset-password");
          setAuthFlow("recovery");
        } else {
          // Hash present but no valid session = expired/used link
          setLinkExpired(true);
        }
      });
    }

    return () => subscription.unsubscribe();
  }, [setAuthFlow]);

  // Handle ?canceled=true from Stripe
  useEffect(() => {
    const canceled = searchParams.get("canceled");
    if (canceled === "true") {
      toast({
        title: "Payment not completed",
        description: "Your payment wasn't completed. You can try again when you're ready.",
        variant: "default",
      });
      // Clear the param from URL
      window.history.replaceState({}, '', '/auth');
    }
  }, [searchParams, toast]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Reset auth flow on successful sign in
      setAuthFlow("normal");
      // Note: organisation resolution is owned by AppContext's auth listener,
      // which calls ensureOrganization() in a single-flight guarded way.
      // Do NOT call it here — duplicate calls used to race and create two orgs.

      toast({
        title: "Welcome back",
        description: "You've been signed in successfully.",
      });

      // Self-heal: if a previous signup left a pending org behind (e.g. the
      // user got bounced from Stripe due to a cross-origin session loss),
      // send them back to the checkout/verification flow instead of the
      // dashboard so they can finish setting up billing.
      const pendingOrgId = localStorage.getItem("pending_org_id");
      navigate(pendingOrgId ? "/complete-payment" : "/");
    } catch (error: any) {
      toast({
        title: "Error signing in",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== signupConfirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const trimmedOrgName = (organizationName || "").trim();
      // Persist the practice name so we can create the org after email
      // confirmation (when signUp returns no session). setPendingOrgName
      // ignores empty strings internally.
      setPendingOrgName(trimmedOrgName);

      // Create user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${getAppUrl()}/complete-payment`,
          data: trimmedOrgName
            ? { pending_org_name: trimmedOrgName }
            : undefined,
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          throw new Error("This email is already registered. Please sign in instead.");
        }
        throw authError;
      }
      if (!authData.user) throw new Error("No user returned");

      // Check if email confirmation is required (no session returned)
      if (!authData.session) {
        // Redirect to confirm email page
        navigate(`/confirm-email?email=${encodeURIComponent(email)}`);
        return;
      }

      // Session exists - set it and continue with org creation
      await supabase.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      });

      // Create organization (idempotent RPC — safe even if AppContext
      // listener also fires).
      const { data: orgId, error: orgError } = await supabase
        .rpc('create_organization_with_owner', {
          org_name: trimmedOrgName || "My Practice",
        });

      if (orgError) {
        console.error("Organization creation error:", orgError);
        throw new Error("Failed to create organization. Please try again.");
      }

      if (!orgId) {
        throw new Error("Organization was not created properly. Please contact support.");
      }

      toast({
        title: "Welcome to AccountancyOS",
        description: "Redirecting you to complete payment setup...",
      });

      // Store org ID in localStorage for recovery if Stripe is cancelled/fails
      localStorage.setItem("pending_org_id", orgId);

      // Redirect to Stripe checkout (edge function sets pending_checkout_session_id server-side)
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        "stripe-checkout",
        {
          body: {
            organizationId: orgId,
            organizationName: organizationName,
          },
        }
      );

      if (checkoutError) {
        console.error("Stripe checkout error:", checkoutError);
        throw new Error("Failed to start payment setup. Please try again.");
      }

      if (checkoutData?.url) {
        // CRITICAL: Set redirect state BEFORE navigation to prevent any routing
        setIsRedirectingToStripe(true);
        // Use window.location.href for full page navigation (no React routing)
        window.location.href = checkoutData.url;
        // Return immediately - don't let any more code execute
        return;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Signup error:", error);
      toast({
        title: "Error creating account",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
    // Note: Don't setLoading(false) after successful checkout redirect - we want to stay in loading state
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getAppUrl()}/auth?reset=true`,
      });

      if (error) throw error;

      toast({
        title: "Check your email",
        description: "We've sent you a password reset link. Please check your inbox.",
      });
      
      setMode("signin");
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ 
        password: newPassword 
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been successfully updated. Please sign in with your new password.",
      });

      // Sign out to clear recovery session
      await supabase.auth.signOut();
      
      // Reset auth flow and clean up URL
      setAuthFlow("normal");
      window.history.replaceState({}, '', '/auth');
      
      // Reset form state
      setNewPassword("");
      setConfirmPassword("");
      setMode("signin");
    } catch (error: any) {
      toast({
        title: "Error updating password",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    setAuthFlow("normal");
    setLinkExpired(false);
    setMode("signin");
    window.history.replaceState({}, '', '/auth');
  };

  // Show redirect overlay when going to Stripe
  if (isRedirectingToStripe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-lg font-medium">Redirecting to secure checkout...</p>
              <p className="text-sm text-muted-foreground">
                You'll be taken to Stripe to complete your payment setup.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show link expired state
  if (linkExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-4 pb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="bg-destructive/10 p-2 rounded-lg">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Reset Link Expired</CardTitle>
            <CardDescription className="text-center">
              This password reset link has expired or has already been used.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button 
              className="w-full" 
              onClick={() => {
                setLinkExpired(false);
                setMode("forgot");
              }}
            >
              Request New Reset Link
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBackToSignIn}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show reset password form
  if (mode === "reset-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-4 pb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="bg-primary p-2 rounded-lg">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Set New Password</CardTitle>
            <CardDescription className="text-center">
              Enter your new password below
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  placeholder="Enter new password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                  placeholder="Confirm new password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBackToSignIn}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
      <h1 className="sr-only">Sign in to AccountancyOS or create your practice account</h1>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl text-center">AccountancyOS</CardTitle>
          <CardDescription className="text-center">
            {mode === "forgot" 
              ? "Enter your email to reset your password"
              : "The unified operating system for UK accountancy practices"
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          {mode === "forgot" ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@firm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode("signin")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </form>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as AuthMode)}>
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@firm.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <Button
                        type="button"
                        variant="link"
                        className="px-0 h-auto font-normal text-sm"
                        onClick={() => setMode("forgot")}
                      >
                        Forgot password?
                      </Button>
                    </div>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Firm Name</Label>
                    <Input
                      id="org-name"
                      type="text"
                      placeholder="Your Accountancy Firm Ltd"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@firm.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                    />
                    {signupConfirmPassword.length > 0 && password !== signupConfirmPassword && (
                      <p className="text-sm text-destructive">Passwords don't match</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;