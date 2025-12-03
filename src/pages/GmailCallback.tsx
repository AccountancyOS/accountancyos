import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

const GmailCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Gmail account...");

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setStatus("error");
        setMessage(`Google returned an error: ${error}`);
        setTimeout(() => navigate(`/settings?error=${encodeURIComponent(error)}`), 2000);
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setMessage("Invalid callback - missing code or state");
        setTimeout(() => navigate("/settings?error=invalid_request"), 2000);
        return;
      }

      try {
        // Call the gmail-exchange function to exchange the code for tokens
        const { data, error: exchangeError } = await supabase.functions.invoke("gmail-exchange", {
          body: { code, state },
        });

        if (exchangeError) {
          throw new Error(exchangeError.message || "Token exchange failed");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        setStatus("success");
        setMessage("Gmail connected successfully!");
        setTimeout(() => navigate("/settings?gmail_connected=true"), 1500);
      } catch (err) {
        console.error("Gmail callback error:", err);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to connect Gmail");
        setTimeout(() => navigate("/settings?error=exchange_failed"), 2000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg text-muted-foreground">{message}</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg text-foreground">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-lg text-destructive">{message}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default GmailCallback;
