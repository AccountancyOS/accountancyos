import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  LineChart, 
  FileText, 
  FolderOpen, 
  CheckSquare, 
  MessageSquare 
} from "lucide-react";

const tabs = [
  { name: "Overview", href: "/portal/dashboard", icon: LayoutDashboard },
  { name: "Financials", href: "/portal/financials", icon: LineChart },
  { name: "Filings & Deadlines", href: "/portal/filings", icon: FileText },
  { name: "Documents", href: "/portal/documents", icon: FolderOpen },
  { name: "Tasks", href: "/portal/tasks", icon: CheckSquare },
  { name: "Messages", href: "/portal/messages", icon: MessageSquare },
];

export function PortalTabs() {
  const location = useLocation();

  return (
    <div className="border-b bg-background">
      <nav className="flex overflow-x-auto scrollbar-hide" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.href || 
            (tab.href !== "/portal/dashboard" && location.pathname.startsWith(tab.href));
          
          return (
            <NavLink
              key={tab.name}
              to={tab.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
