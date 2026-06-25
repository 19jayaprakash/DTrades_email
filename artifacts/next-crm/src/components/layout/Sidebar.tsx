import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard,
  Send,
  History,
  FileText,
  Settings,
  Users,
  AlertCircle,
  LogOut,
  PenTool,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  if (!user) return null;

  const isAdmin = user.role === "admin";

  const navItems = isAdmin
    ? [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/documents", label: "Branding & Signature", icon: PenTool },
        { href: "/templates", label: "Templates", icon: FileText },
        { href: "/users", label: "Users", icon: Users },
        { href: "/errors", label: "Errors", icon: AlertCircle },
        { href: "/history", label: "History", icon: History },
      ]
    : [
        { href: "/compose", label: "Send Email", icon: Send },
        { href: "/history", label: "History", icon: History },
      ];

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Signed out",
        description: "You have logged out successfully.",
      });
    } catch {
      toast({
        title: "Signed out",
        description: "You have logged out.",
      });
    }
  };

  return (
    <div
      className="flex h-screen w-64 flex-col text-sidebar-foreground border-r border-sidebar-border relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, hsl(228, 35%, 14%) 0%, hsl(228, 35%, 10%) 100%)",
      }}
    >
      {/* Subtle top glow accent */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none opacity-30"
        style={{
          background: "radial-gradient(ellipse at 50% -20%, hsl(234, 85%, 58%) 0%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div className="relative flex h-16 items-center px-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg"
            style={{
              background: "linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))",
            }}
          >
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <div className="overflow-hidden">
            <div className="text-white font-semibold text-sm leading-tight tracking-tight">D Trades</div>
            <div className="text-white/40 text-[10px] tracking-[0.2em] uppercase font-medium">International</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 px-3 mb-2">
          {isAdmin ? "Management" : "Email"}
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-[13px] relative ${
                isActive
                  ? "text-white font-medium"
                  : "text-white/55 hover:text-white/90 hover:bg-white/[0.06]"
              }`}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{
                    background: "linear-gradient(180deg, hsl(234, 85%, 62%), hsl(262, 83%, 58%))",
                  }}
                />
              )}
              {/* Active background glow */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-lg opacity-[0.08]"
                  style={{
                    background: "linear-gradient(90deg, hsl(234, 85%, 58%), transparent)",
                  }}
                />
              )}
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 flex-shrink-0 ${
                  isActive
                    ? "bg-white/[0.12]"
                    : "bg-transparent group-hover:bg-white/[0.05]"
                }`}
              >
                <Icon className={`h-[15px] w-[15px] transition-colors duration-200 ${isActive ? "text-white" : ""}`} />
              </div>
              <span className="relative">{item.label}</span>
              {isActive && (
                <ChevronRight className="h-3 w-3 ml-auto text-white/40" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="relative p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-white/10"
            style={{
              background: "linear-gradient(135deg, hsl(234, 85%, 55%), hsl(262, 83%, 55%))",
            }}
          >
            <span className="text-white text-xs font-semibold">
              {user.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-white text-sm font-medium truncate">{user.name}</div>
            <div className="text-white/40 text-xs capitalize">
              {user.role}{user.region ? ` · ${user.region}` : ""}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-white/[0.08] hover:text-white/90 hover:border-white/[0.12] transition-all duration-200"
          onClick={handleLogout}
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
