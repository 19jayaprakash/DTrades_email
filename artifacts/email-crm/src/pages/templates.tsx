import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { useListTemplates, getListTemplatesQueryKey, useDeleteTemplate, useCreateTemplate, useUpdateTemplate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function Templates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: templates, isLoading } = useListTemplates({ query: { queryKey: getListTemplatesQueryKey() } });
  
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
    }
  });

  if (user?.role !== "admin") {
    return <Redirect to="/compose" />;
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
    });
    setDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
            <p className="text-muted-foreground">Manage your reusable email templates.</p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="htmlContent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>HTML Content</FormLabel>
                        <FormControl>
                          <RichTextEditor value={field.value || ""} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium leading-none">Live Preview</p>
                      <div 
                        className="border rounded-md p-4 min-h-[300px] prose prose-sm max-w-none dark:prose-invert bg-white"
                        dangerouslySetInnerHTML={{ __html: form.watch("htmlContent") || "<p class='text-muted-foreground'>Preview will appear here</p>" }}
                      />
                    </div>
                  </div>

                  <DialogFooter>
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
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12">
              <p className="text-muted-foreground mb-4">No templates created yet.</p>
              <Button variant="outline" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Create First Template</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates?.map(template => (
              <Card key={template.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-1">{template.name}</CardTitle>
                    {template.category && <Badge variant="secondary">{template.category}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1">{template.subject}</p>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="text-xs text-muted-foreground mb-2">Variables:</div>
                  <div className="flex flex-wrap gap-1">
                    {template.variables?.length ? template.variables.map(v => (
                      <Badge key={v} variant="outline" className="text-[10px] py-0">{v}</Badge>
                    )) : <span className="text-xs text-muted-foreground">None</span>}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t p-4">
                  <div className="text-xs text-muted-foreground">Updated {new Date(template.updatedAt || template.createdAt).toLocaleDateString()}</div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(template)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(template.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
