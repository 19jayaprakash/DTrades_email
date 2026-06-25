"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useListErrors, getListErrorsQueryKey, useRetryEmail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Errors() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const { data: errors, isLoading } = useListErrors({ limit: 100 }, { query: { queryKey: getListErrorsQueryKey({ limit: 100 }) } });
  const retryMutation = useRetryEmail();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/compose");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") {
    return null;
  }

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await retryMutation.mutateAsync({ id });
      toast({ title: "Email added to retry queue" });
      queryClient.invalidateQueries({ queryKey: getListErrorsQueryKey({ limit: 100 }) });
    } catch (e) {
      toast({ title: "Failed to retry email", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">System Errors</h1>
          <p className="text-muted-foreground text-sm">Log of failed operations and sending errors.</p>
        </div>

        <Card className="rounded-2xl animate-fade-in-up stagger-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Error Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : errors?.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 gap-4">
                <CheckCircle2 className="h-16 w-16 text-primary/40" />
                <div className="text-center">
                  <p className="text-base font-medium text-foreground">All Clear</p>
                  <p className="text-sm text-muted-foreground mt-1">No recent errors found. Everything is running smoothly.</p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Error Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors?.map((err) => (
                    <TableRow key={err.id} className="hover:bg-primary/[0.02] transition-all duration-150">
                      <TableCell className="text-xs whitespace-nowrap">{new Date(err.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-sm">{err.accountName}</TableCell>
                      <TableCell className="text-sm">{err.recipientEmail}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">{err.errorType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm" title={err.errorMessage}>
                        {err.errorMessage}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {err.canRetry && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={retryingId === err.id}
                            onClick={() => handleRetry(err.id)}
                          >
                            {retryingId === err.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                            Retry
                          </Button>
                        )}
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
