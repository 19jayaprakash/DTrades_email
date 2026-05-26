import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, 
  Send, 
  History, 
  FileText, 
  Settings, 
  Users, 
  AlertCircle,
  LogOut,
  Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === "admin";

  const navItems = [
    ...(isAdmin ? [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    { href: "/compose", label: "Compose", icon: Send },
    { href: "/history", label: "History", icon: History },
    ...(isAdmin ? [
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/accounts", label: "Accounts", icon: Settings },
      { href: "/users", label: "Users", icon: Users },
      { href: "/errors", label: "Errors", icon: AlertCircle },
    ] : [])
  ];

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-6 border-b border-sidebar-border bg-sidebar">
        <Mail className="h-6 w-6 text-primary mr-3" />
        <span className="font-bold text-lg tracking-tight">MailFlow</span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <a className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <Icon className="h-4 w-4" />
                <span className="text-sm">{item.label}</span>
              </a>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <span className="text-xs text-sidebar-foreground/60 capitalize">{user.role} • {user.region}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full justify-center bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" />
          Log out
        </Button>
      </div>
    </div>
  );
}
