"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListTemplates, getListTemplatesQueryKey, useDeleteTemplate, useCreateTemplate, useUpdateTemplate, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  htmlContent: z.string().min(1, "Content is required"),
  textContent: z.string().optional(),
  category: z.string().optional(),
  variables: z.string().optional(),
  assignedUserIds: z.array(z.number()).default([]),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function Templates() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: templates, isLoading } = useListTemplates({ query: { queryKey: getListTemplatesQueryKey() } });
  const { data: users } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  
  const deleteMutation = useDeleteTemplate();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      subject: "",
      htmlContent: "",
      textContent: "",
      category: "",
      variables: "",
      assignedUserIds: [],
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
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      toast({ title: "Template deleted successfully" });
    } catch (e) {
      toast({ title: "Failed to delete template", variant: "destructive" });
    }
  };

  const onSubmit = async (data: TemplateFormValues) => {
    const variables = data.variables ? data.variables.split(",").map(v => v.trim()).filter(Boolean) : [];
    
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ 
          id: editingId, 
          data: {
            ...data,
            variables
          }
        });
        toast({ title: "Template updated successfully" });
      } else {
        await createMutation.mutateAsync({ 
          data: {
            ...data,
            variables
          }
        });
        toast({ title: "Template created successfully" });
      }
      queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Failed to save template", description: e.error || "An error occurred", variant: "destructive" });
    }
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    form.reset({
      name: t.name,
      subject: t.subject,
      htmlContent: t.htmlContent,
      textContent: t.textContent || "",
      category: t.category || "",
      variables: t.variables?.join(", ") || "",
      assignedUserIds: t.assignedUserIds || [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      name: "",
      subject: "",
      htmlContent: "",
      textContent: "",
      category: "",
      variables: "",
      assignedUserIds: [],
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Templates</h1>
            <p className="text-muted-foreground text-sm">Manage your reusable email templates.</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="shadow-sm glow-ring">
                <Plus className="mr-2 h-4 w-4" /> New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border-t-4 border-t-primary">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-foreground">{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Template Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem><FormLabel>Category (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  
                  <FormField control={form.control} name="subject" render={({ field }) => (
                    <FormItem><FormLabel>Subject Line</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  
                  <FormField control={form.control} name="variables" render={({ field }) => (
                    <FormItem><FormLabel>Variables (comma separated, e.g. name, company)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField
                    control={form.control}
                    name="assignedUserIds"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-2">
                        <FormLabel className="text-xs font-semibold text-slate-700">Assign Template to Users</FormLabel>
                        <div className="text-[11px] text-slate-500 mb-1">
                          Select which team members can view and use this template. Leave empty to allow all members.
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[140px] overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50/50 no-scrollbar">
                          {users?.map((u: any) => {
                            const isChecked = field.value?.includes(u.id);
                            return (
                              <label
                                key={u.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-all ${
                                  isChecked
                                    ? "bg-indigo-50/60 border-indigo-200 text-indigo-900 font-semibold"
                                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const currentValue = field.value || [];
                                    const newValue = isChecked
                                      ? currentValue.filter((id: number) => id !== u.id)
                                      : [...currentValue, u.id];
                                    field.onChange(newValue);
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                />
                                <span className="text-xs truncate">{u.name} ({u.role})</span>
                              </label>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4 items-stretch">
                    <FormField control={form.control} name="htmlContent" render={({ field }) => (
                      <FormItem className="flex flex-col h-full justify-between">
                        <FormLabel>HTML Content</FormLabel>
                        <FormControl>
                          <RichTextEditor value={field.value || ""} onChange={field.onChange} className="h-[400px]" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    
                    <div className="flex flex-col h-full justify-between">
                      <p className="text-sm font-medium leading-none mb-2">Live Preview</p>
                      <div 
                        className="border rounded-xl p-4 bg-white overflow-y-auto prose prose-sm max-w-none dark:prose-invert"
                        style={{ height: "400px" }}
                        dangerouslySetInnerHTML={{ __html: form.watch("htmlContent") || "<p class='text-muted-foreground'>Preview will appear here</p>" }}
                      />
                    </div>
                  </div>

                  <DialogFooter className="gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Template
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

        </div>

        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : templates?.length === 0 ? (
          <Card className="rounded-2xl animate-fade-in-up">
            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
              <div className="stat-icon-indigo h-14 w-14 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-white" />
              </div>
              <p className="text-foreground font-medium mb-1">No templates yet</p>
              <p className="text-muted-foreground mb-6 text-sm max-w-sm">Create your first reusable email template to streamline your workflow.</p>
              <Button variant="outline" onClick={openCreate} className="glow-ring"><Plus className="mr-2 h-4 w-4" /> Create First Template</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates?.map((template, index) => {
              const gradients = [
                'from-indigo-500 to-purple-600',
                'from-sky-400 to-blue-600',
                'from-emerald-400 to-teal-600',
                'from-amber-400 to-orange-600',
                'from-rose-400 to-pink-600',
              ];
              return (
                <Card key={template.id} className={`flex flex-col rounded-2xl overflow-hidden border border-slate-100 hover:border-slate-200 hover:shadow-lg transition-all duration-300 bg-white animate-fade-in-up stagger-${Math.min(index + 1, 8)}`}>
                  {/* Top Gradient Bar */}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${gradients[index % gradients.length]}`} />
                  
                  <CardHeader className="pb-3 pt-5">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-base line-clamp-1 font-bold text-slate-800 leading-tight">
                        {template.name}
                      </CardTitle>
                      {template.category && (
                        <Badge className="text-[10px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 border-none px-2 py-0.5 shrink-0">
                          {template.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs font-medium text-slate-400 mt-1 line-clamp-1">
                      {template.subject}
                    </p>
                  </CardHeader>
                  
                  <CardContent className="flex-1 pb-4">
                    {/* Variables section */}
                    <div className="mb-4">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Variables</div>
                      <div className="flex flex-wrap gap-1">
                        {template.variables?.length ? (
                          template.variables.map(v => (
                            <Badge key={v} variant="outline" className="text-[10px] border-slate-200/80 bg-slate-50/50 text-slate-600 font-medium px-2 py-0">
                              {v}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-400 italic font-medium">None</span>
                        )}
                      </div>
                    </div>

                    {/* Assignment section */}
                    <div className="pt-3 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Members</div>
                      <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto no-scrollbar">
                        {template.assignedUserIds?.length ? (
                          template.assignedUserIds.map((uid: number) => {
                            const matchingUser = users?.find((u: any) => u.id === uid);
                            return (
                              <Badge key={uid} variant="outline" className="text-[10px] bg-indigo-50/60 text-indigo-700 border-indigo-100 px-2 py-0.5 font-medium">
                                {matchingUser ? matchingUser.name : `User #${uid}`}
                              </Badge>
                            );
                          })
                        ) : (
                          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 px-2 py-0.5 font-semibold">
                            All Team Members
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  
                  <CardFooter className="flex justify-between border-t border-slate-50 p-4 bg-slate-50/30">
                    <div className="text-[10px] font-medium text-slate-400">
                      Updated {new Date(template.updatedAt || template.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer" 
                        onClick={() => openEdit(template)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
