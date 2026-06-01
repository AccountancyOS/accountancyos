import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { portQuoteToClient, getQuotePortStatus } from "@/lib/quote-port-service";
import { useNavigate } from "react-router-dom";
import { ArrowRightCircle, CheckCircle2 } from "lucide-react";

interface Props {
  quoteId: string;
  quoteStatus?: string;
}

export default function PortQuoteToClientButton({ quoteId, quoteStatus }: Props) {
  const [status, setStatus] = useState<{ ported_to_client_id: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const s = await getQuotePortStatus(quoteId);
      setStatus(s as any);
    })();
  }, [quoteId]);

  const onPort = async () => {
    setBusy(true);
    try {
      const clientId = await portQuoteToClient(quoteId);
      toast({ title: "Client Created", description: "Quote ported to client record." });
      nav(`/clients/${clientId}`);
    } catch (e: any) {
      toast({ title: "Port Failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (status?.ported_to_client_id) {
    return (
      <Button variant="outline" size="sm" onClick={() => nav(`/clients/${status.ported_to_client_id}`)}>
        <CheckCircle2 className="h-4 w-4 mr-2" /> View Client
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={onPort} disabled={busy || quoteStatus !== "accepted"}>
      <ArrowRightCircle className="h-4 w-4 mr-2" />
      {busy ? "Porting…" : "Port To Client"}
    </Button>
  );
}