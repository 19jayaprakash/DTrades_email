"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { useRouter } from "next/navigation";
import {
  useListAccounts, getListAccountsQueryKey,
  useListTemplates, getListTemplatesQueryKey,
  useSendEmails,
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
import { Loader2, Send, Users, Eye, Mail } from "lucide-react";
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
  const router = useRouter();
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

  // Attachments query removed (attachments disabled)

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
  const templateId = form.watch("templateId");
  const selectedTemplate = templates?.find(t => t.id === templateId);

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
      router.push("/history");
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
      <div className="flex flex-col gap-6 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="animate-fade-in-up flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> Outbound outreach console
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-800 font-serif leading-tight">Send Outreach Campaign</h1>
            <p className="text-slate-500 text-sm mt-1 font-sans">
              Deploy customized bulk email communications to global clients and buyers.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Grid split layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                
                {/* Left Column - D Trades International */}
                <Card className="lg:col-span-7 rounded-2xl border border-slate-100 bg-white shadow-md overflow-hidden relative flex flex-col h-full">
                  {/* Elegant top gradient accent line */}
                  <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                  
                  <CardHeader className="pb-4 pt-6">
                    <CardTitle className="text-lg font-bold text-slate-800">D Trades International</CardTitle>
                    <CardDescription className="text-xs text-slate-400">Specify sender details, templates, and the email subject.</CardDescription>
                  </CardHeader>
                  
                  <CardContent className="space-y-6 flex-1 flex flex-col">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <FormField
                        control={form.control}
                        name="accountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold uppercase text-slate-400 tracking-wider">Sender Account</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : undefined}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-slate-200 hover:border-slate-300 focus:ring-primary/20 h-11 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                                  <SelectValue placeholder="Select active sender..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="rounded-xl">
                                {accounts?.map(acc => (
                                  <SelectItem key={acc.id} value={acc.id.toString()} className="cursor-pointer rounded-lg">
                                    <div className="flex items-center justify-between w-full gap-4">
                                      <span className="font-semibold text-slate-800">{acc.name}</span>
                                      <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500 font-medium py-0 h-4 border-slate-200">
                                        {acc.region}
                                      </Badge>
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
                            <FormLabel className="text-xs font-bold uppercase text-slate-400 tracking-wider">Email Template</FormLabel>
                            <Select onValueChange={onTemplateChange} value={field.value ? field.value.toString() : undefined}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-slate-200 hover:border-slate-300 focus:ring-primary/20 h-11 bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer">
                                  <SelectValue placeholder="Select template..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="rounded-xl">
                                {templates?.map(t => (
                                  <SelectItem key={t.id} value={t.id.toString()} className="cursor-pointer rounded-lg">
                                    <span className="font-medium text-slate-800">{t.name}</span>
                                  </SelectItem>
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
                          <FormLabel className="text-xs font-bold uppercase text-slate-400 tracking-wider">Subject Line</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g. Premium Masala & Spices Export Catalog - D Trades" 
                              className="rounded-xl border-slate-200 hover:border-slate-300 focus:ring-primary/20 h-11 bg-slate-50/50 hover:bg-slate-50 transition font-medium"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Template Live Preview Section */}
                    <div className="flex-1 flex flex-col min-h-[220px] space-y-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" /> Template Live Preview
                      </span>
                      
                      {selectedTemplate ? (
                        <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl flex-1 flex flex-col min-h-0 shadow-inner">
                          <iframe
                            srcDoc={`
                              <!DOCTYPE html>
                              <html>
                                <head>
                                  <style>
                                    body {
                                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                      margin: 12px;
                                      color: #334155;
                                      font-size: 13px;
                                      line-height: 1.5;
                                    }
                                  </style>
                                </head>
                                <body>
                                  ${selectedTemplate.htmlContent || selectedTemplate.textContent || '<p style="color: #94a3b8; font-style: italic;">No body content</p>'}
                                </body>
                              </html>
                            `}
                            title="Template Preview"
                            className="w-full flex-1 rounded-lg bg-white border border-slate-100/80 shadow-sm"
                          />
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-slate-200 bg-slate-50/30 rounded-xl flex-1 flex flex-col items-center justify-center p-6 text-center transition-colors">
                          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                            <Mail className="h-5 w-5 text-slate-400" />
                          </div>
                          <span className="text-xs font-semibold text-slate-500">No template selected</span>
                          <span className="text-[10px] text-slate-400 mt-1 max-w-[240px]">
                            Choose an email template from the dropdown above to preview the newsletter or outreach layout here.
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Right Column - Recipients Console */}
                <Card className="lg:col-span-5 rounded-2xl border border-slate-100 bg-white shadow-md overflow-hidden flex flex-col h-full">
                  <CardHeader className="pb-3 pt-6 flex flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-800">Recipients List</CardTitle>
                      <CardDescription className="text-xs text-slate-400">List client emails below (one per line).</CardDescription>
                    </div>
                    {recipientCount > 0 && (
                      <Badge
                        className="gap-1.5 text-xs text-white border-0 px-3 py-1 font-semibold rounded-full shadow-sm animate-scale-in shrink-0"
                        style={{ background: 'linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))' }}
                      >
                        <Users className="h-3.5 w-3.5" />
                        {recipientCount} Client{recipientCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col space-y-4 pb-6">
                    {/* Format Hint box */}
                    <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3 text-[11px] text-slate-500 leading-relaxed font-sans">
                      <span className="font-bold text-slate-700">Supported Formats:</span>
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600 font-medium">
                        <li><code className="text-indigo-600 font-mono">buyer@restaurant.com</code></li>
                        <li><code className="text-indigo-600 font-mono">John Smith,john@wholesale.co.uk</code></li>
                      </ul>
                    </div>

                    <FormField
                      control={form.control}
                      name="recipients"
                      render={({ field }) => (
                        <FormItem className="flex-1 flex flex-col space-y-0">
                          <FormControl className="flex-1">
                            <Textarea
                              placeholder={"buyer@restaurant.com\nJohn Smith,john@wholesale.co.uk\nRachel Green,rachel@grocer.com.au"}
                              className="min-h-[220px] lg:min-h-[240px] font-mono text-xs resize-none rounded-xl border-slate-200 bg-slate-50/30 focus-within:bg-white focus:ring-primary/20 p-4 leading-relaxed flex-1"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="mt-1" />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

              </div>

              {/* Action Bar */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={sendMutation.isPending}
                  className="min-w-[160px] h-12 shadow-lg text-white font-bold rounded-xl active:scale-[0.98] transition-all cursor-pointer border-0 text-sm flex items-center justify-center gap-2 glow-ring"
                  style={{ background: 'linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))' }}
                >
                  {sendMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Queuing Campaign...</>
                  ) : (
                    <><Send className="h-4 w-4" /> Launch Outreach</>
                  )}
                </Button>
              </div>

            </form>
          </Form>
        )}
      </div>
    </AppLayout>
  );
}
