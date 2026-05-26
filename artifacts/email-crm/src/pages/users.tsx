import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import {
  useListUsers, getListUsersQueryKey,
  useDeleteUser, useCreateUser, useUpdateUser,
  useListAttachments, getListAttachmentsQueryKey,
  useCreateAttachment, useDeleteAttachment,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, Paperclip, FileText, File, Upload, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
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

const FILE_SLOTS = [
  { label: "Terms & Conditions", key: "tnc" },
  { label: "Brochure / Catalogue", key: "brochure" },
];

function UserFilesDialog({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [uploading, setUploading] = useState<number | null>(null);

  const { data: attachments, isLoading } = useListAttachments(
    { userId },
    { query: { queryKey: getListAttachmentsQueryKey({ userId }), enabled: open } }
  );
  const createMutation = useCreateAttachment();
  const deleteMutation = useDeleteAttachment();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey({ userId }) });

  const handleUpload = async (slotIndex: number, file: File) => {
    setUploading(slotIndex);
    try {
      const slotLabel = FILE_SLOTS[slotIndex].label;
      const existing = attachments?.find(a =>
        a.name.toLowerCase().includes(slotIndex === 0 ? "terms" : "brochure") ||
        a.name === slotLabel
      );
      if (existing) {
        await deleteMutation.mutateAsync({ id: existing.id });
      }
      const content = await fileToBase64(file);
      await createMutation.mutateAsync({
        data: {
          userId,
          name: slotLabel,
          filename: file.name,
          mimeType: file.type || "application/pdf",
          content,
          isActive: true,
        }
      });
      refresh();
      toast({ title: `${slotLabel} uploaded`, description: `Attached to ${userName}'s emails.` });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.error || "An error occurred", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (id: number, name: string) => {
    try {
      await deleteMutation.mutateAsync({ id });
      refresh();
      toast({ title: `${name} removed` });
    } catch {
      toast({ title: "Failed to remove", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-primary" />
            Attachments for {userName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          These files will be attached automatically to every email sent by this user.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3 py-2">
            {FILE_SLOTS.map((slot, idx) => {
              const existing = attachments?.find(a =>
                a.name === slot.label ||
                a.name.toLowerCase().includes(idx === 0 ? "terms" : "brochure")
              );
              return (
                <div key={slot.key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{slot.label}</span>
                    </div>
                    {existing && (
                      <Badge variant="secondary" className="text-xs">Uploaded</Badge>
                    )}
                  </div>

                  {existing ? (
                    <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <File className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <span className="text-xs text-foreground truncate">{existing.filename}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground underline mr-1"
                          onClick={() => fileRefs[idx].current?.click()}
                          disabled={uploading === idx}
                        >
                          Replace
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemove(existing.id, existing.name)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="w-full border-2 border-dashed border-border rounded-md py-4 flex flex-col items-center gap-1.5 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                      onClick={() => fileRefs[idx].current?.click()}
                      disabled={uploading === idx}
                    >
                      {uploading === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <Upload className="h-4 w-4 text-muted-foreground/60" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {uploading === idx ? "Uploading..." : "Click to upload PDF"}
                      </span>
                    </button>
                  )}

                  <input
                    ref={fileRefs[idx]}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(idx, file);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const [filesDialogUser, setFilesDialogUser] = useState<{ id: number; name: string } | null>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", role: "user", region: "", password: "", isActive: true }
  });

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
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            name: data.name,
            role: data.role,
            region: data.region,
            isActive: data.isActive,
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
          data: { email: data.email, name: data.name, password: data.password, role: data.role, region: data.region }
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
    form.reset({ name: u.name, email: u.email, role: u.role, region: u.region || "", password: "", isActive: u.isActive });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: "", email: "", role: "user", region: "", password: "", isActive: true });
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
                    <TableHead>Attachments</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((u) => (
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => setFilesDialogUser({ id: u.id, name: u.name })}
                        >
                          <Paperclip className="h-3 w-3" />
                          Manage Files
                        </Button>
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <FormControl><Input type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {editingId && (
                <FormField control={form.control} name="isActive" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <FormLabel className="text-sm font-normal">Active Account</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
              )}
              <DialogFooter>
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

      {/* Per-user file management dialog */}
      {filesDialogUser && (
        <UserFilesDialog
          userId={filesDialogUser.id}
          userName={filesDialogUser.name}
          open={!!filesDialogUser}
          onClose={() => setFilesDialogUser(null)}
        />
      )}
    </AppLayout>
  );
}
