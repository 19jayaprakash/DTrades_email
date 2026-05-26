import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Paperclip, FileText, File } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import {
  useListAttachments, getListAttachmentsQueryKey,
  useCreateAttachment, useUpdateAttachment, useDeleteAttachment
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(base64: string) {
  const bytes = Math.round((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export default function Attachments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments, isLoading } = useListAttachments({ query: { queryKey: getListAttachmentsQueryKey() } });
  const createMutation = useCreateAttachment();
  const updateMutation = useUpdateAttachment();
  const deleteMutation = useDeleteAttachment();

  if (user?.role !== "admin") return <Redirect to="/compose" />;

  const openDialog = () => {
    setUploadName("");
    setSelectedFile(null);
    setDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadName) setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) return;
    setUploading(true);
    try {
      const content = await fileToBase64(selectedFile);
      await createMutation.mutateAsync({
        data: {
          name: uploadName.trim(),
          filename: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          content,
          isActive: true,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey() });
      toast({ title: "Attachment uploaded", description: `${uploadName} added successfully.` });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.error || "An error occurred", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleToggle = async (id: number, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { isActive } });
      queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey() });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this attachment? It will no longer be sent with emails.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey() });
      toast({ title: "Attachment deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const activeCount = attachments?.filter(a => a.isActive).length ?? 0;

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Attachments</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Files attached automatically to every outgoing email.
              {activeCount > 0 && <span className="text-primary font-medium"> {activeCount} active attachment{activeCount !== 1 ? "s" : ""}.</span>}
            </p>
          </div>
          <Button onClick={openDialog}>
            <Plus className="mr-2 h-4 w-4" /> Upload File
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                Email Attachments
              </CardTitle>
              <CardDescription>
                Toggle attachments on or off. Active files will be included in every email sent through the system.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : !attachments?.length ? (
                <div className="text-center py-12">
                  <Paperclip className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No attachments uploaded yet</p>
                  <p className="text-muted-foreground/60 text-sm mt-1">Upload your Terms &amp; Conditions and Brochure PDFs</p>
                  <Button variant="outline" className="mt-4" onClick={openDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Upload First File
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Include in Emails</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attachments.map(att => (
                      <TableRow key={att.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <FileIcon mimeType={att.mimeType} />
                            <div>
                              <div className="font-medium text-sm">{att.name}</div>
                              <div className="text-xs text-muted-foreground">{att.filename}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {att.mimeType === "application/pdf" ? "PDF" : att.mimeType.split("/")[1]?.toUpperCase() ?? "File"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(att.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={att.isActive}
                              onCheckedChange={(checked) => handleToggle(att.id, checked)}
                            />
                            <span className="text-xs text-muted-foreground">
                              {att.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={() => handleDelete(att.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Attachment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div className="text-left">
                    <div className="font-medium text-sm">{selectedFile.name}</div>
                    <div className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
              ) : (
                <>
                  <Paperclip className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Click to select a file</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF, DOCX, or any document</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
                onChange={handleFileChange}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input
                placeholder="e.g. Terms & Conditions"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !uploadName.trim() || uploading}
            >
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
