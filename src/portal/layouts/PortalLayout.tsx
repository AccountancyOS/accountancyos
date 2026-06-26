import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  FolderOpen,
  ClipboardList,
  CreditCard,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import { usePortalConversations } from "../hooks/usePortalData";
import { useAnyPortalBookkeepingAccess } from "../hooks/usePortalBookkeepingAccess";
import { Badge } from "@/components/ui/badge";
import { portalPath } from "../utils/portalPaths";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PortalLayout() {
  const navigate = useNavigate();
  const { entities, currentEntity, setCurrentEntity } = usePortalEntity();
  const conversations = usePortalConversations();
  const unreadConversations = (conversations.data ?? []).filter((c) => c.unreadCount > 0).length;
  const bookkeepingAccess = useAnyPortalBookkeepingAccess();
  const baseNavItems = [
    { to: portalPath("dashboard"), icon: LayoutDashboard, label: "Dashboard" },
    { to: portalPath("tasks"), icon: CheckSquare, label: "Tasks" },
    { to: portalPath("documents"), icon: FolderOpen, label: "Documents" },
    { to: portalPath("questionnaires"), icon: ClipboardList, label: "Questionnaires" },
    { to: portalPath("messages"), icon: MessageSquare, label: "Messages" },
    { to: portalPath("payments"), icon: CreditCard, label: "Payments" },
  ];
  const navItems = bookkeepingAccess.data
    ? [...baseNavItems, { to: portalPath("bookkeeping"), icon: BarChart3, label: "Bookkeeping" }]
    : baseNavItems;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(portalPath("login"), { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sidebar-foreground text-sm truncate">
                Client Portal
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">AccountancyOS</p>
            </div>
          </div>
          {entities.length > 1 ? (
            <Select
              value={currentEntity ? `${currentEntity.type}:${currentEntity.id}` : undefined}
              onValueChange={(v) => {
                const found = entities.find((e) => `${e.type}:${e.id}` === v);
                if (found) setCurrentEntity(found);
              }}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue placeholder="Select Entity" />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={`${e.type}:${e.id}`} value={`${e.type}:${e.id}`}>
                    {e.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : currentEntity ? (
            <p className="text-xs text-sidebar-foreground/70 truncate">
              {currentEntity.displayName}
            </p>
          ) : null}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isMessages = item.to === portalPath("messages");
            return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  isActive && "bg-sidebar-accent text-sidebar-foreground",
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {isMessages && unreadConversations > 0 && (
                <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                  {unreadConversations}
                </Badge>
              )}
            </NavLink>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <NavLink
            to={portalPath("settings")}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                isActive && "bg-sidebar-accent text-sidebar-foreground",
              )
            }
          >
            <SettingsIcon className="h-5 w-5 shrink-0" />
            <span>Profile & Settings</span>
          </NavLink>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      <main className="pl-64">
        <Outlet />
      </main>
    </div>
  );
}