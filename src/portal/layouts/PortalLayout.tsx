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

const navItems = [
  { to: "/portal/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/portal/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/portal/documents", icon: FolderOpen, label: "Documents" },
  { to: "/portal/questionnaires", icon: ClipboardList, label: "Questionnaires" },
  { to: "/portal/messages", icon: MessageSquare, label: "Messages" },
  { to: "/portal/payments", icon: CreditCard, label: "Payments" },
  { to: "/portal/bookkeeping", icon: BarChart3, label: "Bookkeeping" },
];

export function PortalLayout() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
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

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
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
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
          <NavLink
            to="/portal/settings"
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