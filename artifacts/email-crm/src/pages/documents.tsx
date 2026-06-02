import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import {
  useListAttachments,
  useCreateAttachment,
  useUpdateAttachment,
  useDeleteAttachment,
  useListUsers,
  Attachment,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Paperclip, FileText, File, Upload, X, Users, Check, PenTool } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useEffect } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  // Unsigned preset — safe to include directly in client code
  const cloudName = 
    (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME || 
    (import.meta as any).env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    "drni46zvq";  // Cloudinary cloud name

  const uploadPreset = 
    (import.meta as any).env?.VITE_CLOUDINARY_UPLOAD_PRESET || 
    (import.meta as any).env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ||
    "dtrades_preset";  // Unsigned upload preset

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.secure_url) {
            resolve(res.secure_url);
          } else {
            reject(new Error("Cloudinary response is missing secure_url"));
          }
        } catch {
          reject(new Error("Failed to parse Cloudinary upload response"));
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          reject(new Error(errRes.error?.message || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during Cloudinary upload"));
    xhr.send(formData);
  });
}

export default function Documents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"terms" | "catalog" | "signature">("terms");
  const [uploading, setUploading] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Assignment state
  const [assigningDoc, setAssigningDoc] = useState<Attachment | null>(null);
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([]);

  // Queries & Mutations
  const { data: allAttachments, isLoading: docsLoading } = useListAttachments();
  const { data: users, isLoading: usersLoading } = useListUsers();
  
  const createMutation = useCreateAttachment();
  const updateMutation = useUpdateAttachment();
  const deleteMutation = useDeleteAttachment();

  // Signature editor state
  const [sigValue, setSigValue] = useState("");
  const [isSavingSig, setIsSavingSig] = useState(false);
  const [hasLoadedSig, setHasLoadedSig] = useState(false);

  const signatureDoc = allAttachments?.find(doc => (doc as any).type === "signature");
  const customBannerDoc = allAttachments?.find(doc => (doc as any).type === "signature_banner");

  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      toast({
        title: "File too large",
        description: "The signature banner must be smaller than 10 MB.",
        variant: "destructive",
      });
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, or JPEG).",
        variant: "destructive",
      });
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      return;
    }

    setIsSavingBanner(true);
    setUploadProgress(0);
    try {
      const secureUrl = await uploadToCloudinary(file, (pct) => {
        setUploadProgress(pct);
      });

      if (customBannerDoc) {
        await updateMutation.mutateAsync({
          id: customBannerDoc.id,
          data: {
            name: "Custom Signature Banner",
            content: secureUrl,
          }
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: "Custom Signature Banner",
            filename: file.name,
            mimeType: file.type,
            content: secureUrl,
            type: "signature_banner",
            isActive: true,
            assignedUserIds: [],
          }
        });
      }
      refresh();
      toast({
        title: "Banner updated",
        description: "The custom signature banner has been uploaded to Cloudinary successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSavingBanner(false);
      setUploadProgress(0);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  };

  const handleDeleteBanner = async () => {
    if (!customBannerDoc) return;
    if (!confirm("Are you sure you want to delete the custom signature banner? Outgoing emails will fall back to the default banner.")) return;

    setIsSavingBanner(true);
    try {
      await deleteMutation.mutateAsync({ id: customBannerDoc.id });
      refresh();
      toast({
        title: "Banner deleted",
        description: "The custom signature banner has been removed.",
      });
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSavingBanner(false);
    }
  };

  useEffect(() => {
    if (allAttachments && !hasLoadedSig) {
      const doc = allAttachments.find(d => (d as any).type === "signature");
      if (doc) {
        try {
          setSigValue(doc.content ? decodeURIComponent(escape(window.atob(doc.content))) : "");
        } catch {
          setSigValue(doc.content || "");
        }
      } else {
        setSigValue(`
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #2d2d2d; line-height: 1.5; margin-top: 20px;">
  <p style="margin: 0 0 4px; color: #555555;">Warm regards,</p>
  <p style="margin: 0 0 4px; font-weight: bold; color: #2d2d2d; font-size: 16px;">Dhivya Kunarajah</p>
  <p style="margin: 0 0 12px; font-weight: bold; color: #c47a1b; font-size: 14px;">Founder, D Trades</p>
  <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">📞 +91 7708194433</p>
  <p style="margin: 0 0 4px; color: #555555; font-size: 13px;">🌐 <a href="https://dtradesinternational.in" target="_blank" style="color: #c47a1b; text-decoration: none;">dtradesinternational.in</a></p>
  <p style="margin: 0 0 16px; color: #555555; font-size: 13px;">✉️ <a href="mailto:dtradesinternational@gmail.com" style="color: #c47a1b; text-decoration: none;">dtradesinternational@gmail.com</a></p>
  <div style="margin-top: 15px;">
    <img src="cid:signature_banner_image" alt="D Trades Spices & Ingredients" style="width: 100%; max-width: 600px; display: block;" />
  </div>
</div>
        `);
      }
      setHasLoadedSig(true);
    }
  }, [allAttachments, hasLoadedSig]);

  const handleSaveSignature = async () => {
    setIsSavingSig(true);
    try {
      const base64Content = window.btoa(unescape(encodeURIComponent(sigValue)));
      if (signatureDoc) {
        await updateMutation.mutateAsync({
          id: signatureDoc.id,
          data: {
            content: base64Content,
          }
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: "Global Signature",
            filename: "signature.html",
            mimeType: "text/html",
            content: base64Content,
            type: "signature",
            isActive: true,
            assignedUserIds: [],
          }
        });
      }
      refresh();
      toast({
        title: "Signature saved",
        description: "The global email signature has been updated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Failed to save signature",
        description: err.error || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSavingSig(false);
    }
  };

  if (user?.role !== "admin") return <Redirect to="/compose" />;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attachments"] });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSizeBytes) {
        toast({
          title: "File too large",
          description: "Each document must be smaller than 50 MB.",
          variant: "destructive",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
      if (!newDocName) {
        // Pre-fill name from file
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setNewDocName(nameWithoutExt);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !newDocName) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const secureUrl = await uploadToCloudinary(selectedFile, (pct) => {
        setUploadProgress(pct);
      });

      await createMutation.mutateAsync({
        data: {
          name: newDocName,
          filename: selectedFile.name,
          mimeType: selectedFile.type || "application/pdf",
          content: secureUrl,
          type: activeTab === "signature" ? "catalog" : activeTab,
          isActive: true,
          assignedUserIds: [], // Start with empty assignments
        }
      });
      refresh();
      setIsUploadOpen(false);
      setSelectedFile(null);
      setNewDocName("");
      toast({
        title: "Document uploaded",
        description: `"${newDocName}" has been successfully uploaded to Cloudinary.`,
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleToggleActive = async (doc: Attachment) => {
    try {
      await updateMutation.mutateAsync({
        id: doc.id,
        data: {
          isActive: !doc.isActive,
        }
      });
      refresh();
      toast({
        title: `Document ${!doc.isActive ? "activated" : "deactivated"}`,
      });
    } catch {
      toast({
        title: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      refresh();
      toast({
        title: "Document deleted",
      });
    } catch {
      toast({
        title: "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  // User Assignments Modal Handlers
  const openAssignModal = (doc: Attachment) => {
    setAssigningDoc(doc);
    // Cast because generated openapi might not have the correct array type in spec until refreshed
    const currentAssignments = (doc as any).assignedUserIds || [];
    setAssignedUserIds(currentAssignments);
  };

  const handleToggleUserAssignment = (userId: number) => {
    setAssignedUserIds(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const saveAssignments = async () => {
    if (!assigningDoc) return;
    try {
      await updateMutation.mutateAsync({
        id: assigningDoc.id,
        data: {
          assignedUserIds,
        }
      });
      refresh();
      setAssigningDoc(null);
      toast({
        title: "Assignments updated",
        description: `User assignments for "${assigningDoc.name}" have been saved.`,
      });
    } catch {
      toast({
        title: "Failed to update assignments",
        variant: "destructive",
      });
    }
  };

  const termsDocs = allAttachments?.filter(doc => (doc as any).type === "terms") || [];
  const catalogDocs = allAttachments?.filter(doc => (doc as any).type === "catalog") || [];
  const activeDocs = activeTab === "terms" ? termsDocs : (activeTab === "catalog" ? catalogDocs : []);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage Terms & Conditions and Regional Product Catalogs. Assign them to team members.
            </p>
          </div>
          {activeTab !== "signature" && (
            <Button onClick={() => setIsUploadOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Document
            </Button>
          )}
        </div>

        <Tabs 
          value={activeTab} 
          onValueChange={(val) => setActiveTab(val as "terms" | "catalog" | "signature")}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 max-w-[600px] mb-6">
            <TabsTrigger value="terms" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Terms &amp; Conditions
            </TabsTrigger>
            <TabsTrigger value="catalog" className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Product Catalogs
            </TabsTrigger>
            <TabsTrigger value="signature" className="flex items-center gap-2">
              <PenTool className="h-4 w-4" />
              Email Signature
            </TabsTrigger>
          </TabsList>

          <TabsContent value="terms" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Terms &amp; Conditions Files</CardTitle>
                <CardDescription className="text-sm">
                  Upload regulatory and corporate Terms &amp; Conditions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderDocsTable(activeDocs, "terms")}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalog" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Regional Product Catalogs</CardTitle>
                <CardDescription className="text-sm">
                  Manage multiple catalog documents (e.g. USA, UK, UAE brochures) and assign them to respective regional outreach teams.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderDocsTable(activeDocs, "catalog")}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signature" className="m-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Rich Text Editor */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PenTool className="h-4.5 w-4.5 text-primary" />
                    Edit Signature Template
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Customize your global brand email signature. Utilize variables or inline HTML tags directly.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RichTextEditor
                    value={sigValue}
                    onChange={(val) => setSigValue(val)}
                    className="min-h-[350px]"
                    showBanners={true}
                    hasCustomBanner={!!customBannerDoc}
                  />
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveSignature} disabled={isSavingSig} className="min-w-[120px]">
                      {isSavingSig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Signature
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Right Column - Custom Banner Uploader & Live Render Preview */}
              <div className="space-y-6">
                {/* Custom Signature Banner Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Upload className="h-4.5 w-4.5 text-primary" />
                      Signature Banner Image
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Upload your bespoke brand banner (PNG or JPG). Max size 10MB.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {customBannerDoc ? (
                      <div className="space-y-3">
                        <div className="relative border rounded-lg p-3 bg-slate-50 flex items-center gap-3">
                          <img 
                            src={customBannerDoc.content?.startsWith("http") ? customBannerDoc.content : `data:${customBannerDoc.mimeType};base64,${customBannerDoc.content || ""}`} 
                            alt="Custom Banner" 
                            className="h-12 w-20 object-cover rounded border bg-white"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{customBannerDoc.filename}</p>
                            <p className="text-[10px] text-slate-400">
                              {(customBannerDoc.mimeType).toUpperCase()} • Active Custom Banner
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleDeleteBanner}
                            disabled={isSavingBanner}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => bannerInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        {isSavingBanner ? (
                          <div className="flex flex-col items-center gap-1">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs font-semibold text-primary">{uploadProgress}%</span>
                          </div>
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground/60" />
                        )}
                        <span className="text-sm font-medium text-slate-600">
                          {isSavingBanner ? "Uploading banner..." : "Click to upload banner image"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Supports PNG, JPG up to 10MB
                        </span>
                      </div>
                    )}
                    <input 
                      ref={bannerInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      onChange={handleUploadBanner}
                      className="hidden"
                      disabled={isSavingBanner}
                    />
                  </CardContent>
                </Card>

                {/* Live Render Preview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4.5 w-4.5 text-primary" />
                      Live Render Preview
                    </CardTitle>
                    <CardDescription className="text-sm">
                      This is how the signature will look when attached to outgoing client emails.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-slate-50 border rounded-lg p-6 shadow-inner relative overflow-hidden">
                      <div className="absolute top-3 right-3">
                        <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700 text-[10px]">
                          {signatureDoc?.isActive !== false ? "Active Default" : "Inactive"}
                        </Badge>
                      </div>
                      
                      <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-4 border-b pb-2">
                        ✉️ Signature Output
                      </div>

                      <div 
                        className="text-slate-700 prose prose-sm max-w-none font-sans"
                        dangerouslySetInnerHTML={{ 
                          __html: sigValue.replace(
                            "cid:signature_banner_image", 
                            customBannerDoc?.content 
                              ? (customBannerDoc.content.startsWith("http") ? customBannerDoc.content : `data:${customBannerDoc.mimeType};base64,${customBannerDoc.content}`)
                              : "/export_masala.png"
                          ) 
                        }} 
                      />
                    </div>

                    <div className="text-xs text-muted-foreground bg-slate-100/50 border rounded-lg p-3">
                      💡 <strong>Pro-Tip:</strong> The rich text editor allows toggling between <strong>Visual Mode</strong> and <strong>HTML Code Mode</strong>. To embed high-end graphic layout components, switch to HTML Mode and configure styles inline.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload {activeTab === "terms" ? "Terms & Conditions" : "Catalog brochure"}</DialogTitle>
            <DialogDescription className="text-xs">
              Upload PDF or document files to associate with regional email campaigns.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="docName">Document Title</Label>
              <Input
                id="docName"
                placeholder={activeTab === "terms" ? "Standard Terms 2026" : "USA Spice Catalog"}
                value={newDocName}
                onChange={e => setNewDocName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>File Upload</Label>
              <div 
                className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-accent/40 cursor-pointer transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 text-muted-foreground/60" />
                <span className="text-sm font-medium">
                  {selectedFile ? selectedFile.name : "Click to browse files"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Supports PDF, DOC, DOCX"}
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                required
              />
            </div>

            {uploading && (
              <div className="space-y-2 pt-2 pb-1">
                <div className="flex justify-between text-xs font-semibold text-primary">
                  <span>Uploading to Cloudinary...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading || !selectedFile}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload File
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assignment Modal */}
      <Dialog open={!!assigningDoc} onOpenChange={(open) => !open && setAssigningDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Assign Users to "{assigningDoc?.name}"
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select which team members will automatically attach this document to their outbound campaigns.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 max-h-[300px] overflow-y-auto space-y-2">
            {usersLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : !users?.length ? (
              <p className="text-center text-muted-foreground text-sm py-4">No team members found.</p>
            ) : (
              users
                .filter(u => u.role === "user") // Only assign to sender/user profiles
                .map((u) => {
                  const isChecked = assignedUserIds.includes(u.id);
                  return (
                    <div 
                      key={u.id} 
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        isChecked ? "bg-primary/5 border-primary/30" : "hover:bg-slate-50"
                      }`}
                      onClick={() => handleToggleUserAssignment(u.id)}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">{u.name}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.region && (
                          <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider py-0.5">
                            {u.region}
                          </Badge>
                        )}
                        <Checkbox 
                          checked={isChecked} 
                          onCheckedChange={() => handleToggleUserAssignment(u.id)}
                          className="h-4 w-4"
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setAssigningDoc(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveAssignments}>
              Save Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );

  function renderDocsTable(docs: Attachment[], tabType: "terms" | "catalog") {
    if (docsLoading) {
      return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    }

    if (!docs.length) {
      return (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-slate-50/50">
          <File className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground text-sm font-medium">No documents uploaded yet.</p>
          <Button variant="link" className="text-xs text-primary" onClick={() => setIsUploadOpen(true)}>
            Click here to upload your first document
          </Button>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document Title</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => {
            const docAssignments = (doc as any).assignedUserIds || [];
            return (
              <TableRow key={doc.id}>
                <TableCell className="font-semibold text-sm text-foreground">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{doc.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {doc.filename}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[280px]">
                    {docAssignments.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
                    ) : (
                      docAssignments.map((uId: number) => {
                        const userRow = users?.find(u => u.id === uId);
                        return userRow ? (
                          <Badge key={uId} variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                            {userRow.name} {userRow.region ? `(${userRow.region})` : ""}
                          </Badge>
                        ) : null;
                      })
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <button 
                    onClick={() => handleToggleActive(doc)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border cursor-pointer select-none transition ${
                      doc.isActive 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/50" 
                        : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/50"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${doc.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {doc.isActive ? "Active" : "Inactive"}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs gap-1.5 font-medium"
                      onClick={() => openAssignModal(doc)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Assign Users
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(doc.id, doc.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }
}
