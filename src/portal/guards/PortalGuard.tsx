import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPortalUserContext,
  listPortalEntities,
} from "../services/portalContextService";
import { PortalEntityProvider } from "../contexts/PortalEntityContext";
import type { PortalEntity, PortalUserContext } from "../types";
import { portalPath, withReturnTo } from "../utils/portalPaths";

/**
 * PortalGuard
 *
 * Order: session check -> getUser() -> getPortalUserContext() -> render or redirect.
 *
 * Batch 1: getPortalUserContext() is a stub that returns null, so every
 * authenticated visit currently lands at /portal/login. Batch 2 wires the
 * stub to real portal_access lookups.
 */
export function PortalGuard() {
  const location = useLocation();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "unauth" }
    | { status: "no-access" }
    | { status: "ok"; ctx: PortalUserContext; entities: PortalEntity[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setState({ status: "unauth" });
        return;
      }
      const ctx = await getPortalUserContext();
      if (cancelled) return;
      if (!ctx) {
        setState({ status: "no-access" });
        return;
      }
      const entities = await listPortalEntities();
      if (cancelled) return;
      setState({ status: "ok", ctx, entities });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "unauth" || state.status === "no-access") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={withReturnTo(portalPath("login"), returnTo)} replace />;
  }

  return (
    <PortalEntityProvider ctx={state.ctx} entities={state.entities}>
      <Outlet />
    </PortalEntityProvider>
  );
}