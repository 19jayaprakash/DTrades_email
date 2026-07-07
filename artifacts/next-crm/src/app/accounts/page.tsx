"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListAccounts, getListAccountsQueryKey, useDeleteAccount, useCreateAccount, useUpdateAccount } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  region: z.string().min(1, "Region is required"),
  smtpHost: z.string().default("mail.dtradesinternational.in"),
  smtpPort: z.coerce.number().default(465),
  smtpUser: z.string().default(""),
  smtpPass: z.string().default(""),
  dailyLimit: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
  signature: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function Accounts() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: accounts, isLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });

  const deleteMutation = useDeleteAccount();
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [provider, setProvider] = useState<string>("custom");

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      email: "",
      region: "",
      smtpHost: "mail.dtradesinternational.in",
      smtpPort: 465,
      smtpUser: "",
      smtpPass: "",
      dailyLimit: 500,
      isActive: true,
      signature: "",
    }
  });

  // Watch email field to sync with SMTP User for specific providers
  const emailValue = form.watch("email");
  useEffect(() => {
    if (provider === "outlook" || provider === "office365" || provider === "gmail") {
      form.setValue("smtpUser", emailValue);
    }
  }, [emailValue, provider]);

  const handleProviderChange = (val: string) => {
    setProvider(val);
    if (val === "outlook") {
      form.setValue("smtpHost", "smtp-mail.outlook.com");
      form.setValue("smtpPort", 587);
      form.setValue("smtpUser", form.getValues("email"));
    } else if (val === "office365") {
      form.setValue("smtpHost", "smtp.office365.com");
      form.setValue("smtpPort", 587);
      form.setValue("smtpUser", form.getValues("email"));
    } else if (val === "gmail") {
      form.setValue("smtpHost", "smtp.gmail.com");
      form.setValue("smtpPort", 465);
      form.setValue("smtpUser", form.getValues("email"));
    } else {
      // custom
      form.setValue("smtpHost", "mail.dtradesinternational.in");
      form.setValue("smtpPort", 465);
    }
  };

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/compose");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return null;
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      toast({ title: "Account deleted successfully" });
    } catch (e) {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
  };

  const onSubmit = async (data: AccountFormValues) => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ 
          id: editingId, 
          data: {
            ...data,
            signature: data.signature || "",
          }
        });
        toast({ title: "Account updated successfully" });
      } else {
        await createMutation.mutateAsync({ 
          data: {
            ...data,
            signature: data.signature || "",
          }
        });
        toast({ title: "Account created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Failed to save account", description: e.error || "An error occurred", variant: "destructive" });
    }
  };

  const openEdit = (acc: any) => {
    setEditingId(acc.id);
    let detectedProvider = "custom";
    if (acc.smtpHost === "smtp-mail.outlook.com") {
      detectedProvider = "outlook";
    } else if (acc.smtpHost === "smtp.office365.com") {
      detectedProvider = "office365";
    } else if (acc.smtpHost === "smtp.gmail.com") {
      detectedProvider = "gmail";
    }
    setProvider(detectedProvider);

    form.reset({
      name: acc.name,
      email: acc.email,
      region: acc.region,
      smtpHost: acc.smtpHost,
      smtpPort: acc.smtpPort,
      smtpUser: acc.smtpUser || "",
      smtpPass: acc.smtpPass || "",
      dailyLimit: acc.dailyLimit || 500,
      isActive: acc.isActive,
      signature: acc.signature || "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setProvider("custom");
    form.reset({
      name: "",
      email: "",
      region: "",
      smtpHost: "mail.dtradesinternational.in",
      smtpPort: 465,
      smtpUser: "",
      smtpPass: "",
      dailyLimit: 500,
      isActive: true,
      signature: "",
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-serif text-[#1e293b]">Accounts</h1>
            <p className="text-muted-foreground text-sm">Manage your sender accounts and SMTP settings.</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="shadow-sm">
                <Plus className="mr-2 h-4 w-4" /> Add Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-serif">{editingId ? "Edit Account" : "Create Account"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="region" render={({ field }) => (
                      <FormItem><FormLabel>Region</FormLabel><FormControl><Input {...field} placeholder="e.g. USA, UK" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="dailyLimit" render={({ field }) => (
                      <FormItem><FormLabel>Daily Limit</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />

                  </div>

                  <div className="border-t pt-4 my-2">
                    <h3 className="text-sm font-semibold text-slate-800 mb-3">SMTP Settings</h3>
                    
                    <div className="mb-4">
                      <FormLabel className="text-xs font-semibold text-slate-600 block mb-1">Email Provider Preset</FormLabel>
                      <Select value={provider} onValueChange={handleProviderChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select provider preset" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom SMTP / VPS (e.g. mail.dtradesinternational.in)</SelectItem>
                          <SelectItem value="outlook">Outlook / Hotmail (Personal - smtp-mail.outlook.com)</SelectItem>
                          <SelectItem value="office365">Office 365 / Microsoft 365 (smtp.office365.com)</SelectItem>
                          <SelectItem value="gmail">Gmail (smtp.gmail.com)</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {provider === "outlook" && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md">
                          <strong>Microsoft App Password Required:</strong> Microsoft personal accounts require 
                          you to enable <strong>2-Step Verification</strong> and use an <strong>App Password</strong> as 
                          the SMTP Password here. Your regular Outlook password will be rejected.
                        </div>
                      )}
                      {provider === "office365" && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md">
                          <strong>Office 365 SMTP Auth Note:</strong> Microsoft 365 accounts require 
                          <strong>SMTP AUTH</strong> to be enabled for this mailbox in the Microsoft 365 Admin Center, 
                          and you may need to use an <strong>App Password</strong> if Multi-Factor Authentication (MFA) is active.
                        </div>
                      )}
                      {provider === "gmail" && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md">
                          <strong>Gmail App Password Required:</strong> Google requires you to enable 
                          <strong>2-Step Verification</strong> on your Google Account and generate an 
                          <strong>App Password</strong> to use as the SMTP Password here.
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="smtpHost" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Host</FormLabel>
                          <FormControl><Input {...field} placeholder="e.g. mail.dtradesinternational.in" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="smtpPort" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Port</FormLabel>
                          <FormControl><Input type="number" {...field} placeholder="465" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="smtpUser" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP User</FormLabel>
                          <FormControl><Input {...field} placeholder="e.g. user@domain.com" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="smtpPass" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SMTP Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                 type="text" 
                                 style={!showSmtpPass ? { ["WebkitTextSecurity" as any]: "disc" } : undefined} 
                                 {...field} 
                                 placeholder="••••••••" 
                                 autoComplete="off" 
                               />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowSmtpPass(!showSmtpPass)}
                              >
                                {showSmtpPass ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <FormField control={form.control} name="signature" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Signature (HTML/Text)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Warm regards,<br><b>John Smith</b><br>Sales Manager..."
                          className="min-h-[100px] font-mono text-sm" 
                        />
                      </FormControl>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">HTML formatting is fully supported. Leave blank to default to standard signature.</span>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {editingId && (
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Active Account</FormLabel>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}

                  <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">Sender Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : accounts?.length === 0 ? (
              <p className="text-center text-muted-foreground p-8 text-sm">No accounts found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Email</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Daily Limit</TableHead>

                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts?.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{acc.name}</div>
                        <div className="text-sm text-muted-foreground">{acc.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">{acc.region}</TableCell>
                      <TableCell>
                        <Badge variant={acc.isActive ? "default" : "secondary"} className="text-xs">
                          {acc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[200px] text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs">
                            <span>{acc.sentToday || 0} sent</span>
                            <span className="text-muted-foreground">{acc.dailyLimit ? `/${acc.dailyLimit}` : ''}</span>
                          </div>
                          <Progress value={acc.dailyLimit ? ((acc.sentToday || 0) / acc.dailyLimit) * 100 : 0} />
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(acc)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(acc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
