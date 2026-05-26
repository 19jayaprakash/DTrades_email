import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { useListErrors, getListErrorsQueryKey, useRetryEmail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function Errors() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const { data: errors, isLoading } = useListErrors({ limit: 100 }, { query: { queryKey: getListErrorsQueryKey({ limit: 100 }) } });
  const retryMutation = useRetryEmail();

  if (user?.role !== "admin") {
    return <Redirect to="/compose" />;
  }

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    try {
      await retryMutation.mutateAsync({ data: { emailHistoryId: id } });
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Errors</h1>
          <p className="text-muted-foreground">Log of failed operations and sending errors.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Error Log</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
            ) : errors?.length === 0 ? (
              <p className="text-center text-muted-foreground p-8">No recent errors.</p>
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
                    <TableRow key={err.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(err.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{err.accountName}</TableCell>
                      <TableCell>{err.recipientEmail}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{err.errorType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate" title={err.errorMessage}>
                        {err.errorMessage}
                      </TableCell>
                      <TableCell className="text-right">
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
