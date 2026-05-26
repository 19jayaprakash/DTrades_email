import { AppLayout } from "@/components/layout/AppLayout";
import { 
  useListAccounts, getListAccountsQueryKey, 
  useListTemplates, getListTemplatesQueryKey,
  useSendEmails 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const composeSchema = z.object({
  accountId: z.coerce.number().min(1, "Please select an account"),
  templateId: z.coerce.number().min(1, "Please select a template"),
  subject: z.string().min(1, "Subject is required"),
  recipients: z.string().min(1, "Please provide at least one recipient"),
  delaySeconds: z.coerce.number().min(0).max(3600),
});

type ComposeValues = z.infer<typeof composeSchema>;

export default function Compose() {
  const { toast } = useToast();
  const { data: accounts, isLoading: accountsLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: templates, isLoading: templatesLoading } = useListTemplates({ query: { queryKey: getListTemplatesQueryKey() } });
  
  const sendMutation = useSendEmails();

  const form = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      accountId: 0,
      templateId: 0,
      subject: "",
      recipients: "",
      delaySeconds: 2
    }
  });

  // Auto-fill subject when template changes
  const onTemplateChange = (templateId: string) => {
    form.setValue("templateId", parseInt(templateId));
    const template = templates?.find(t => t.id === parseInt(templateId));
    if (template) {
      form.setValue("subject", template.subject);
    }
  };

  const onSubmit = async (data: ComposeValues) => {
    if (!confirm(`Are you sure you want to queue this campaign to ${data.recipients.split('\n').filter(Boolean).length} recipients?`)) return;
    
    try {
      const res = await sendMutation.mutateAsync({ data });
      toast({ 
        title: "Campaign queued", 
        description: `Successfully queued ${res.queued} out of ${res.recipients} recipients.` 
      });
      form.reset({
        accountId: data.accountId,
        templateId: data.templateId,
        subject: data.subject,
        recipients: "",
        delaySeconds: data.delaySeconds
      });
    } catch (e: any) {
      toast({ 
        title: "Failed to queue campaign", 
        description: e.error || "An error occurred",
        variant: "destructive" 
      });
    }
  };

  const isLoading = accountsLoading || templatesLoading;

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compose Campaign</h1>
          <p className="text-muted-foreground">Queue and send precise outreach campaigns.</p>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Send Parameters</CardTitle>
              <CardDescription>Select your sender identity, template, and recipient list.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sender Account</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : undefined}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an account" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {accounts?.filter(a => a.isActive).map(acc => (
                                <SelectItem key={acc.id} value={acc.id.toString()}>{acc.name} ({acc.email})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="templateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Template</FormLabel>
                          <Select onValueChange={onTemplateChange} value={field.value ? field.value.toString() : undefined}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a template" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {templates?.map(t => (
                                <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject Line</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter subject line..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recipients"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recipients List</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="user@example.com&#10;John Doe,john@example.com" 
                            className="min-h-[200px] font-mono text-sm"
                            {...field} 
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground mt-1">One recipient per line. Format: email or Name,email</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-end justify-between border-t pt-6">
                    <FormField
                      control={form.control}
                      name="delaySeconds"
                      render={({ field }) => (
                        <FormItem className="w-[150px]">
                          <FormLabel>Delay Between Sends</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input type="number" min="0" {...field} />
                            </FormControl>
                            <span className="text-sm text-muted-foreground">sec</span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" size="lg" disabled={sendMutation.isPending}>
                      {sendMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
                      Queue Campaign
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
