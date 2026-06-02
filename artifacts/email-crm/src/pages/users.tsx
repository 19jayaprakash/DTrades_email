import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import {
  useListUsers, getListUsersQueryKey,
  useDeleteUser, useCreateUser, useUpdateUser,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "user"]),
  region: z.string().optional(),
  password: z.string().optional(),
  isActive: z.boolean().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  dailyLimit: z.coerce.number().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



export default function Users() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const deleteMutation = useDeleteUser();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswordId, setVisiblePasswordId] = useState<number | null>(null);


  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "user",
      region: "",
      password: "",
      isActive: true,
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      dailyLimit: 500,
    }
  });

  const emailValue = form.watch("email");
  const { setValue } = form;

  useEffect(() => {
    if (emailValue) {
      setValue("smtpUser", emailValue);
    }
  }, [emailValue, setValue]);

  if (user?.role !== "admin") return <Redirect to="/compose" />;

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const onSubmit = async (data: UserFormValues) => {
    try {
      const payload = {
        name: data.name,
        role: data.role,
        region: data.region,
        isActive: data.isActive,
        smtpHost: data.smtpHost || null,
        smtpPort: data.smtpPort || null,
        smtpUser: data.smtpUser || null,
        ...(data.smtpPass ? { smtpPass: data.smtpPass } : {}),
        dailyLimit: data.dailyLimit || null,
      };

      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            ...payload,
            ...(data.password ? { password: data.password } : {})
          }
        });
        toast({ title: "User updated" });
      } else {
        if (!data.password) {
          form.setError("password", { message: "Password is required for new users" });
          return;
        }
        await createMutation.mutateAsync({
          data: {
            ...payload,
            email: data.email,
            password: data.password,
          }
        });
        toast({ title: "User created" });
      }
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.error || "An error occurred", variant: "destructive" });
    }
  };

  const openEdit = (u: any) => {
    setEditingId(u.id);
    form.reset({
      name: u.name,
      email: u.email,
      role: u.role,
      region: u.region || "",
      password: "",
      isActive: u.isActive,
      smtpHost: u.smtpHost || "",
      smtpPort: u.smtpPort || 587,
      smtpUser: u.smtpUser || "",
      smtpPass: u.smtpPass || "",
      dailyLimit: u.dailyLimit || 500,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      name: "",
      email: "",
      role: "user",
      region: "",
      password: "",
      isActive: true,
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      dailyLimit: 500,
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Users</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage team members, roles, and their email attachments.</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Add User
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !users?.length ? (
              <p className="text-center text-muted-foreground py-8">No users found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name / Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>SMTP</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize text-xs">
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.region || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? "outline" : "secondary"} className="text-xs">
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono">
                            {visiblePasswordId === u.id
                              ? (u.passwordPlain || <span className="text-muted-foreground italic">Not set</span>)
                              : (u.passwordPlain ? "••••••••" : <span className="text-muted-foreground italic">—</span>)}
                          </span>
                          {u.passwordPlain && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setVisiblePasswordId(visiblePasswordId === u.id ? null : u.id)}
                            >
                              {visiblePasswordId === u.id
                                ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.smtpHost ? (
                          <div className="text-xs">
                            <div className="font-medium">{u.smtpHost}:{u.smtpPort}</div>
                            <div className="text-muted-foreground mt-0.5">
                              User: {u.smtpUser} • Pass: {u.smtpPass ? "••••••••" : "Not Set"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No SMTP configured</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(u.id)}
                            disabled={u.id === user.id}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Edit / Create user dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit User" : "Create User"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[80vh] overflow-y-auto px-1 pb-1">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} disabled={!!editingId} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="region" render={({ field }) => (
                  <FormItem><FormLabel>Region (Optional)</FormLabel><FormControl><Input {...field} placeholder="USA, UK, India…" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>{editingId ? "New Password (Optional)" : "Password"}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? "text" : "password"}
                        {...field}
                        className="pr-10"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              
              <div className="border-t pt-4 mt-4 space-y-4">
                <h4 className="text-sm font-semibold text-foreground">SMTP Sender settings (Optional)</h4>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <FormField control={form.control} name="smtpHost" render={({ field }) => (
                      <FormItem><FormLabel>SMTP Host</FormLabel><FormControl><Input {...field} placeholder="smtp.gmail.com" autoComplete="new-password" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div>
                    <FormField control={form.control} name="smtpPort" render={({ field }) => (
                      <FormItem><FormLabel>SMTP Port</FormLabel><FormControl><Input type="number" {...field} placeholder="587" autoComplete="new-password" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="smtpUser" render={({ field }) => (
                    <FormItem><FormLabel>SMTP Username</FormLabel><FormControl><Input {...field} placeholder="user@gmail.com" autoComplete="new-password" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="smtpPass" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Password</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input 
                            type={showSmtpPass ? "text" : "password"} 
                            {...field} 
                            placeholder="Password" 
                            autoComplete="new-password" 
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

                <FormField control={form.control} name="dailyLimit" render={({ field }) => (
                  <FormItem><FormLabel>Daily Send Limit</FormLabel><FormControl><Input type="number" {...field} placeholder="500" autoComplete="new-password" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              {editingId && (
                <FormField control={form.control} name="isActive" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm font-normal">Active Account</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              )}
              <DialogFooter className="pt-2">
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


    </AppLayout>
  );
}
