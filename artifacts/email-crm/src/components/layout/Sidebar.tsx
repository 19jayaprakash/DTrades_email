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
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === "admin";

  const navItems = isAdmin
    ? [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/history", label: "History", icon: History },
        { href: "/templates", label: "Templates", icon: FileText },
        { href: "/documents", label: "Documents", icon: Paperclip },
        { href: "/users", label: "Users", icon: Users },
        { href: "/errors", label: "Errors", icon: AlertCircle },
      ]
    : [
        { href: "/compose", label: "Send Email", icon: Send },
        { href: "/history", label: "History", icon: History },
      ];

  return (
    <div className="flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center px-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <div className="overflow-hidden">
            <div className="text-sidebar-foreground font-semibold text-sm leading-tight truncate">D Trades</div>
            <div className="text-sidebar-foreground/50 text-[10px] tracking-widest uppercase">International</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <a className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </a>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <span className="text-sidebar-accent-foreground text-xs font-semibold">
              {user.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-sidebar-foreground text-sm font-medium truncate">{user.name}</div>
            <div className="text-sidebar-foreground/50 text-xs capitalize">
              {user.role}{user.region ? ` · ${user.region}` : ""}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center bg-transparent border-sidebar-border text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:border-sidebar-accent"
          onClick={logout}
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
