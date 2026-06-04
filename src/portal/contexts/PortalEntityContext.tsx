import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PortalEntity, PortalUserContext } from "../types";

interface PortalEntityContextValue {
  ctx: PortalUserContext;
  entities: PortalEntity[];
  currentEntity: PortalEntity | null;
  setCurrentEntity: (e: PortalEntity) => void;
}

const Ctx = createContext<PortalEntityContextValue | null>(null);

function storageKey(userId: string) {
  return `portal:currentEntity:${userId}`;
}

interface ProviderProps {
  ctx: PortalUserContext;
  entities: PortalEntity[];
  children: ReactNode;
}

export function PortalEntityProvider({ ctx, entities, children }: ProviderProps) {
  const [currentEntity, setCurrentEntityState] = useState<PortalEntity | null>(() => {
    if (typeof window === "undefined" || entities.length === 0) return entities[0] ?? null;
    const saved = window.localStorage.getItem(storageKey(ctx.userId));
    if (saved) {
      const match = entities.find((e) => `${e.type}:${e.id}` === saved);
      if (match) return match;
    }
    return entities[0] ?? null;
  });

  useEffect(() => {
    if (!currentEntity || typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey(ctx.userId),
      `${currentEntity.type}:${currentEntity.id}`,
    );
  }, [currentEntity, ctx.userId]);

  const value = useMemo<PortalEntityContextValue>(
    () => ({
      ctx,
      entities,
      currentEntity,
      setCurrentEntity: setCurrentEntityState,
    }),
    [ctx, entities, currentEntity],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortalEntity(): PortalEntityContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortalEntity must be used inside PortalEntityProvider");
  return v;
}