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
import { Loader2, Send, Users } from "lucide-react";
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
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Send Email</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compose and send outreach emails on behalf of D Trades International.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <Card className="rounded-2xl animate-fade-in-up stagger-1">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base font-semibold text-foreground">Campaign Settings</CardTitle>
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

              <Card className="rounded-2xl animate-fade-in-up stagger-2">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold text-foreground">Recipients</CardTitle>
                      <CardDescription className="text-sm mt-1">One per line — email address or Name,email format.</CardDescription>
                    </div>
                    {recipientCount > 0 && (
                      <Badge
                        className="gap-1.5 text-xs text-white border-0"
                        style={{ background: 'linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))' }}
                      >
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



              <div className="flex justify-end glass rounded-2xl border px-5 py-4 gap-4 animate-fade-in-up stagger-3">
                <Button
                  type="submit"
                  disabled={sendMutation.isPending}
                  className="min-w-[140px] shadow-sm text-white hover:opacity-90 border-0"
                  style={{ background: 'linear-gradient(135deg, hsl(234, 85%, 58%), hsl(262, 83%, 58%))' }}
                >
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
