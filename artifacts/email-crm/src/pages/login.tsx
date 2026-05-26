import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login, user } = useAuth();
  const [, setLocation] = useLocation();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data);
    } catch (e) {
      form.setError("root", { message: "Invalid email or password" });
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <div>
              <div className="text-sidebar-foreground font-bold text-lg leading-tight">D Trades</div>
              <div className="text-sidebar-foreground/60 text-xs tracking-widest uppercase">International</div>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-sidebar-foreground leading-snug mb-4">
            Premium Spices &<br />Export Management
          </h2>
          <p className="text-sidebar-foreground/60 text-sm leading-relaxed">
            Manage your outreach campaigns, sender accounts, and email templates from one place.
          </p>
        </div>
        <div className="text-sidebar-foreground/40 text-xs">
          © 2025 D Trades International · GSTIN: 33GJCPD2009H1ZT
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold">D</span>
            </div>
            <div>
              <div className="font-bold text-foreground leading-tight">D Trades International</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to your outreach dashboard</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-sm font-medium text-foreground">Email address</Label>
                    <FormControl>
                      <Input placeholder="you@example.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <Label className="text-sm font-medium text-foreground">Password</Label>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <div className="text-sm font-medium text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
                  {form.formState.errors.root.message}
                </div>
              )}

              <Button type="submit" className="w-full h-10 font-semibold" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign In
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
