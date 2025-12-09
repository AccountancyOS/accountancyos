import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import {
  LayoutDashboard,
  Users,
  Building2,
  BookOpen,
  ClipboardList,
  Calendar,
  FileText,
  FolderOpen,
  Globe,
  Settings,
  LogOut,
  Briefcase,
  Wrench,
  Receipt,
  UserCheck,
  CreditCard,
  Mail,
  Zap,
} from "lucide-react";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "CRM", href: "/crm", icon: Users },
  { name: "Clients", href: "/clients", icon: Briefcase },
  { name: "Emails", href: "/emails", icon: Mail },
  { name: "Services", href: "/services", icon: Wrench },
  { name: "Quotes", href: "/quotes", icon: Receipt },
  { name: "Onboarding", href: "/onboarding", icon: UserCheck },
  { name: "Bookkeeping", href: "/bookkeeping", icon: BookOpen },
  { name: "Jobs", href: "/jobs", icon: ClipboardList },
  { name: "Workpapers", href: "/workpapers", icon: FileText },
  { name: "Deadlines", href: "/deadlines", icon: Calendar },
  { name: "Filings", href: "/filings", icon: Globe },
  { name: "Templates", href: "/templates", icon: FolderOpen },
  { name: "Automations", href: "/automations", icon: Zap },
  { name: "Subscription", href: "/subscription", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { organization } = useOrganization();

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col">
        {/* Logo/Brand */}
        <div className="h-16 flex items-center gap-2 px-6 border-b border-sidebar-border">
          <div className="bg-primary p-1.5 rounded-lg">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg text-sidebar-foreground">AccountancyOS</span>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link key={item.name} to={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 h-10",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
          </div>
        </ScrollArea>

        {/* User section */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {user?.email?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.email}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {organization?.name}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with notification bell */}
        <div className="h-16 border-b border-border bg-card flex items-center justify-end px-6">
          <NotificationBell />
        </div>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
