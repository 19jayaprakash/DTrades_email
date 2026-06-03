import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListAccounts, getListAccountsQueryKey,
  useListTemplates, getListTemplatesQueryKey,
  useSendEmails,
  useListAttachments,
  getListAttachmentsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Send, Users, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const composeSchema = z.object({
  accountId: z.coerce.number().min(1, "Please select an account"),
  templateId: z.coerce.number().min(1, "Please select a template"),
  subject: z.string().min(1, "Subject is required"),
  recipients: z.string().min(1, "Please provide at least one recipient"),
  selectedCatalogIds: z.array(z.coerce.number()).default([]),
});

type ComposeValues = z.infer<typeof composeSchema>;

export default function Compose() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: allAccounts, isLoading: accountsLoading } = useListAccounts({ query: { queryKey: getListAccountsQueryKey() } });
  const { data: templates, isLoading: templatesLoading } = useListTemplates({ query: { queryKey: getListTemplatesQueryKey() } });

  const sendMutation = useSendEmails();

  const form = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      accountId: 0,
      templateId: 0,
      subject: "",
      recipients: "",
      selectedCatalogIds: [],
    }
  });

  const { data: userAttachments, isLoading: attachmentsLoading } = useListAttachments(
    { userId: user?.id },
    { query: { queryKey: getListAttachmentsQueryKey({ userId: user?.id }), enabled: !!user?.id } }
  );

  const accounts = isAdmin
    ? allAccounts?.filter(a => a.isActive)
    : allAccounts?.filter(a => a.isActive && (!user?.region || a.region === user.region));

  const onTemplateChange = (templateId: string) => {
    form.setValue("templateId", parseInt(templateId));
    const template = templates?.find(t => t.id === parseInt(templateId));
    if (template) {
      form.setValue("subject", template.subject);
    }
  };

  const recipientCount = form.watch("recipients").split("\n").filter(l => l.trim()).length;

  const onSubmit = async (data: ComposeValues) => {
    try {
      const res = await sendMutation.mutateAsync({
        data: {
          accountId: data.accountId,
          templateId: data.templateId,
          subject: data.subject,
          recipients: data.recipients,
          delaySeconds: 0,
          selectedCatalogIds: data.selectedCatalogIds,
        } as any
      });
      toast({
        title: "Emails sent",
        description: `${res.queued} of ${res.recipients} emails queued successfully.`
      });
      form.reset({
        accountId: data.accountId,
        templateId: data.templateId,
        subject: data.subject,
        recipients: "",
        selectedCatalogIds: [],
      });
    } catch (e: any) {
      toast({
        title: "Failed to send",
        description: e.error || "An error occurred",
        variant: "destructive"
      });
    }
  };

  const isLoading = accountsLoading || templatesLoading;

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Send Email</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compose and send outreach emails on behalf of D Trades International.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">Campaign Settings</CardTitle>
                  <CardDescription className="text-sm">Choose the sender account and email template.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="accountId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sender Account</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : undefined}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {accounts?.map(acc => (
                                <SelectItem key={acc.id} value={acc.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <span>{acc.name}</span>
                                    <Badge variant="outline" className="text-[10px] py-0 h-4">{acc.region}</Badge>
                                  </div>
                                </SelectItem>
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
                                <SelectValue placeholder="Select template" />
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Recipients</CardTitle>
                      <CardDescription className="text-sm mt-1">One per line — email address or Name,email format.</CardDescription>
                    </div>
                    {recipientCount > 0 && (
                      <Badge variant="secondary" className="gap-1.5">
                        <Users className="h-3 w-3" />
                        {recipientCount} recipient{recipientCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="recipients"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            placeholder={"buyer@restaurant.com\nJohn Smith,john@wholesale.co.uk\nRachel Green,rachel@grocer.com.au"}
                            className="min-h-[220px] font-mono text-sm resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Attachments zone */}
              <Card className="border-primary/10 shadow-xs bg-slate-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-primary animate-pulse" />
                    Campaign Attachment Settings
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Visual catalogs and regulatory terms assigned to your regional profile.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {attachmentsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>Retrieving assigned documents...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
                      {/* Left Box - Terms & Conditions (Auto Attached) */}
                      <div className="space-y-2 border-r pr-4">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          📋 Regulatory Terms (Auto-Attached)
                        </span>
                        {(userAttachments || []).filter(att => (att as any).type === "terms").length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(userAttachments || [])
                              .filter(att => (att as any).type === "terms")
                              .map(att => (
                                <Badge key={att.id} variant="secondary" className="text-xs bg-white border border-slate-200 text-slate-700 font-medium px-2.5 py-1 shadow-2xs">
                                  📄 {att.name}
                                </Badge>
                              ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic pt-1">
                            No terms & conditions active for your profile.
                          </p>
                        )}
                      </div>

                      {/* Right Box - Selectable Product Catalog */}
                      <div className="space-y-3 pl-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          🌾 Select Regional Catalogs
                        </span>
                        {(userAttachments || []).filter(att => (att as any).type === "catalog").length > 0 ? (
                          <FormField
                            control={form.control}
                            name="selectedCatalogIds"
                            render={({ field }) => (
                              <FormItem className="space-y-2.5">
                                <FormControl>
                                  <RadioGroup
                                    onValueChange={(val) => field.onChange([parseInt(val, 10)])}
                                    value={field.value?.[0]?.toString() || ""}
                                    className="space-y-2.5"
                                  >
                                    {(userAttachments || [])
                                      .filter(att => (att as any).type === "catalog")
                                      .map(c => (
                                        <div key={c.id} className="flex items-center space-x-2.5">
                                          <RadioGroupItem value={c.id.toString()} id={`catalog-${c.id}`} />
                                          <label
                                            htmlFor={`catalog-${c.id}`}
                                            className="text-xs font-medium leading-none cursor-pointer text-slate-700"
                                          >
                                            📖 {c.name}
                                          </label>
                                        </div>
                                      ))}
                                  </RadioGroup>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground italic pt-2">
                            No catalogs assigned to your profile.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end bg-slate-50/80 rounded-lg px-5 py-4 border gap-4">
                <Button type="submit" disabled={sendMutation.isPending} className="min-w-[140px] shadow-sm">
                  {sendMutation.isPending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                    : <><Send className="mr-2 h-4 w-4" />Send Emails</>
                  }
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </AppLayout>
  );
}
