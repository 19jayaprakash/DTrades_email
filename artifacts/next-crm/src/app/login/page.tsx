"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { FaPepperHot, FaPlaneDeparture, FaSeedling } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login, user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login(data);
      toast({
        title: "Signed in",
        description: "Welcome back to D Trades Global CRM.",
      });
    } catch (e: any) {
      form.setError("root", { message: "Invalid email or password" });
      toast({
        title: "Login failed",
        description: "Invalid email or password. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row font-sans lg:h-screen lg:overflow-hidden relative bg-slate-900">
      
      {/* Full-bleed background spices image covering the entire screen */}
      <div 
        className="absolute -top-[45%] -bottom-[45%] -left-[20%] -right-[20%] bg-cover bg-center z-0"
        style={{ backgroundImage: "url(/export_masala.png)" }}
      />
      {/* Soft translucent dark overlay covering the entire background */}
      <div className="absolute inset-0 bg-slate-950/35 z-0 pointer-events-none" />

      {/* Left Side: Brand Logo, Slogan & Rich Export Content */}
      <div className="w-full lg:w-[45%] lg:h-full flex flex-col justify-center p-8 md:p-12 lg:p-16 text-left select-none relative overflow-hidden bg-transparent z-10">

        <div className="relative z-10">
          {/* Brand Logo */}
          <div className="text-white/90 font-bold text-xs select-none mb-6 tracking-widest uppercase font-sans">
            D Trades 
          </div>

          {/* Slogan & Title */}
          <h1 className="text-white text-3xl lg:text-4xl font-serif font-medium leading-tight mb-3">
            Global Export CRM
          </h1>

          {/* Description */}
          <p className="text-white/85 text-xs leading-relaxed mb-8 font-sans max-w-sm">
            Sourcing premium agricultural commodities and streamlining international cold chain trade pipelines.
          </p>

          {/* Premium Compact Export Services List */}
          <div className="space-y-3.5 max-w-sm text-left">
            
            {/* Service 1: Spices */}
            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-all">
              <div className="bg-white/10 p-2.5 rounded-lg flex items-center justify-center">
                <FaPepperHot className="text-base text-[#ff4d4d]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm font-serif">Spices &amp; Masalas Sourcing</h3>
                <p className="text-white/85 text-[10px] mt-0.5">Grassroots organic cultivators &amp; farm exports</p>
              </div>
            </div>

            {/* Service 2: Airline Cargo */}
            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-all">
              <div className="bg-white/10 p-2.5 rounded-lg flex items-center justify-center">
                <FaPlaneDeparture className="text-base text-[#60a5fa]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm font-serif">Airline Cargo Export</h3>
                <p className="text-white/85 text-[10px] mt-0.5">Fast cold chain air freight logistics worldwide</p>
              </div>
            </div>

            {/* Service 3: Agro Food Essentials */}
            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-all">
              <div className="bg-white/10 p-2.5 rounded-lg flex items-center justify-center">
                <FaSeedling className="text-base text-[#4ade80]" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm font-serif">Agro Food Essentials</h3>
                <p className="text-white/85 text-[10px] mt-0.5">Premium wholesale staple grains &amp; pulses</p>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Right Side: Clean Login Form Container with Large Rounded Corner */}
      <div className="w-full lg:w-[55%] lg:h-full bg-white flex items-center justify-center p-8 md:p-12 lg:p-16 lg:rounded-l-[4.5rem] rounded-t-[3.5rem] lg:rounded-t-none z-10 relative shadow-2xl overflow-y-auto">
        <div className="w-full max-w-[420px] flex flex-col text-left py-4">
          
          {/* Welcome Text */}
          <h2 className="font-serif text-3xl font-semibold text-[#1e293b] leading-tight mb-2">Welcome to D Trades.</h2>
          <p className="text-slate-500 text-sm font-medium mb-8">Sign in to your outreach dashboard</p>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full">
              
              {/* Email Address with inner-label styling */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <div className="w-full rounded-[1.8rem] border border-[#cdd1ec] bg-slate-50/50 focus-within:bg-white focus-within:border-[#9fa8e8] focus-within:ring-2 focus-within:ring-[#9fa8e8]/10 transition flex flex-col text-left p-3 px-6 shadow-sm">
                        <label className="text-[10px] font-bold text-[#8a8eb5] uppercase tracking-wider mb-0.5 select-none">Email</label>
                        <input 
                          placeholder="John Aikins" 
                          autoComplete="email" 
                          className="text-sm font-medium text-[#1e293b] placeholder-[#aab0db] border-none p-0 focus:ring-0 focus:outline-none bg-transparent w-full"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="px-6 mt-1 text-xs font-semibold text-rose-600" />
                  </FormItem>
                )}
              />

              {/* Password with inner-label styling */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <div className="w-full rounded-[1.8rem] border border-[#cdd1ec] bg-slate-50/50 focus-within:bg-white focus-within:border-[#9fa8e8] focus-within:ring-2 focus-within:ring-[#9fa8e8]/10 transition flex text-left p-3 px-6 shadow-sm relative items-center justify-between">
                        <div className="flex flex-col text-left w-full pr-8">
                          <label className="text-[10px] font-bold text-[#8a8eb5] uppercase tracking-wider mb-0.5 select-none">Password</label>
                          <input 
                            type="text"
                            style={!showPassword ? { ["WebkitTextSecurity" as any]: "disc" } : undefined}
                            placeholder="Enter your password" 
                            autoComplete="off" 
                            className="text-sm font-medium text-[#1e293b] placeholder-[#aab0db] border-none p-0 focus:ring-0 focus:outline-none bg-transparent w-full"
                            {...field} 
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-slate-100/50 rounded-full flex items-center justify-center cursor-pointer border-none"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-[#8a8eb5]" />
                          ) : (
                            <Eye className="h-4 w-4 text-[#8a8eb5]" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage className="px-6 mt-1 text-xs font-semibold text-rose-600" />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <div className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl px-5 py-2.5 shadow-2xs">
                  {form.formState.errors.root.message}
                </div>
              )}

              {/* Primary Periwinkle Sign In Pill Button */}
              <Button 
                type="submit" 
                className="w-full h-13 bg-[#9fa8e8] hover:bg-[#8892df] text-white font-bold rounded-full shadow-md shadow-[#9fa8e8]/20 active:scale-[0.98] transition-all cursor-pointer mt-6 flex items-center justify-center text-sm border-none" 
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                ) : null}
                Sign in
              </Button>
            </form>
          </Form>

        </div>
      </div>
    </div>
  );
}
