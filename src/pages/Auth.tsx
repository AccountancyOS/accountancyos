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

      toast({
        title: "Welcome back",
        description: "You've been signed in successfully.",
      });

      navigate("/");
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
    setLoading(true);

    try {
      // Create user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
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

      // Create organization
      const { data: orgId, error: orgError } = await supabase
        .rpc('create_organization_with_owner', { org_name: organizationName });

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
        redirectTo: `${window.location.origin}/auth?reset=true`,
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

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const result = await lovable.auth.signInWithOAuth("google", {
                          redirect_uri: window.location.origin,
                        });
                        if (result.error) {
                          toast({ title: "Google sign-in failed", description: String(result.error), variant: "destructive" });
                        } else if (result.redirected) {
                          return;
                        } else {
                          setAuthFlow("normal");
                          navigate("/");
                        }
                      } catch (err: any) {
                        toast({ title: "Google sign-in failed", description: err.message, variant: "destructive" });
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Sign in with Google
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

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const result = await lovable.auth.signInWithOAuth("google", {
                          redirect_uri: window.location.origin,
                        });
                        if (result.error) {
                          toast({ title: "Google sign-in failed", description: String(result.error), variant: "destructive" });
                        } else if (result.redirected) {
                          return;
                        } else {
                          setAuthFlow("normal");
                          navigate("/");
                        }
                      } catch (err: any) {
                        toast({ title: "Google sign-in failed", description: err.message, variant: "destructive" });
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Sign up with Google
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