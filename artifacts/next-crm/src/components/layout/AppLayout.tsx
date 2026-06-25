import { ReactNode, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center gradient-bg">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))",
            }}
          >
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto gradient-bg">
        {/* Top accent line */}
        <div
          className="h-[2px] w-full flex-shrink-0"
          style={{
            background: "linear-gradient(90deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%), hsl(340, 75%, 55%), hsl(38, 92%, 50%))",
          }}
        />
        <div className="px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
