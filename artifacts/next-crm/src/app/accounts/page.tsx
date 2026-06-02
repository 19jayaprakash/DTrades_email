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

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  region: z.string().min(1, "Region is required"),
  smtpHost: z.string().min(1, "SMTP Host is required"),
  smtpPort: z.coerce.number().min(1, "SMTP Port is required"),
  smtpUser: z.string().min(1, "SMTP User is required"),
  smtpPass: z.string().optional(),
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

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      email: "",
      region: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      dailyLimit: 500,
      isActive: true,
      signature: "",
    }
  });

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
            ...(data.smtpPass ? { smtpPass: data.smtpPass } : { smtpPass: undefined }),
            signature: data.signature || "",
          }
        });
        toast({ title: "Account updated successfully" });
      } else {
        if (!data.smtpPass) {
          form.setError("smtpPass", { message: "SMTP Password is required for new accounts" });
          return;
        }
        await createMutation.mutateAsync({ 
          data: {
            ...data,
            smtpPass: data.smtpPass,
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
    form.reset({
      name: "",
      email: "",
      region: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
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
                    <FormField control={form.control} name="smtpHost" render={({ field }) => (
                      <FormItem><FormLabel>SMTP Host</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="smtpPort" render={({ field }) => (
                      <FormItem><FormLabel>SMTP Port</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="smtpUser" render={({ field }) => (
                      <FormItem><FormLabel>SMTP User</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="smtpPass" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{editingId ? "New SMTP Password" : "SMTP Password"}</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input 
                              type={showSmtpPass ? "text" : "password"} 
                              {...field} 
                              className="pr-10"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowSmtpPass(!showSmtpPass)}
                          >
                            {showSmtpPass ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
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
                    <TableHead>SMTP</TableHead>
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
                      <TableCell className="text-sm">
                        <div className="text-sm">{acc.smtpHost}:{acc.smtpPort}</div>
                        <div className="text-xs text-muted-foreground">
                          User: {acc.smtpUser} • Pass: {acc.smtpPass ? "••••••••" : "Not Set"}
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
