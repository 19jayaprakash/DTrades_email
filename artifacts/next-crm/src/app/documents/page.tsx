"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListAttachments,
  useCreateAttachment,
  useUpdateAttachment,
  useDeleteAttachment,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, FileText, Upload, PenTool } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export default function BrandingSignature() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Queries & Mutations
  const { data: allAttachments, isLoading: docsLoading } = useListAttachments();
  
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

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/compose");
    }
  }, [user, router]);

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = 8 * 1024 * 1024; // 8MB safety limit for database size
    if (file.size > maxSizeBytes) {
      toast({
        title: "File too large",
        description: "The signature banner must be smaller than 8 MB to store in the database.",
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
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Content = (reader.result as string).split(",")[1];
          
          if (customBannerDoc) {
            await updateMutation.mutateAsync({
              id: customBannerDoc.id,
              data: {
                name: "Custom Signature Banner",
                content: base64Content,
              }
            });
          } else {
            await createMutation.mutateAsync({
              data: {
                name: "Custom Signature Banner",
                filename: file.name,
                mimeType: file.type,
                content: base64Content,
                type: "signature_banner",
                isActive: true,
                assignedUserIds: [],
              }
            });
          }
          refresh();
          toast({
            title: "Banner updated",
            description: "The custom signature banner has been uploaded directly to the database.",
          });
        } catch (err: any) {
          toast({
            title: "Upload failed",
            description: err.data?.error || err.message || "An error occurred",
            variant: "destructive",
          });
        } finally {
          setIsSavingBanner(false);
        }
      };
      reader.onerror = () => {
        toast({
          title: "Read failed",
          description: "Failed to read the image file.",
          variant: "destructive",
        });
        setIsSavingBanner(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
      setIsSavingBanner(false);
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
        description: err.data?.error || err.message || "An error occurred",
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
      
      if (base64Content.length > 3 * 1024 * 1024) {
        toast({
          title: "Signature size is too large",
          description: "Your signature template contains high-resolution embedded images. Please use the 'Signature Banner Image' panel on the right to upload images instead of pasting them directly, to keep it lightweight.",
          variant: "destructive",
        });
        setIsSavingSig(false);
        return;
      }

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
        description: err.data?.error || err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSavingSig(false);
    }
  };

  if (!user || user.role !== "admin") return null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attachments"] });
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Branding & Signature</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure the default outbound email signature and custom banner image stored directly in your database.
          </p>
        </div>

        {docsLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Rich Text Editor */}
            <Card className="rounded-2xl animate-fade-in-up stagger-1">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
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
              <Card className="rounded-2xl animate-fade-in-up stagger-2">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <Upload className="h-4.5 w-4.5 text-primary" />
                    Signature Banner Image
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Upload your bespoke brand banner (PNG or JPG) to store directly in the database. Max size 8MB.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customBannerDoc ? (
                    <div className="space-y-3">
                      <div className="relative border rounded-lg p-3 bg-muted/50 flex items-center gap-3">
                        <img 
                          src={customBannerDoc.content?.startsWith("http") ? customBannerDoc.content : `data:${customBannerDoc.mimeType};base64,${customBannerDoc.content || ""}`} 
                          alt="Custom Banner" 
                          className="h-12 w-20 object-cover rounded border bg-white"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{customBannerDoc.filename}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {(customBannerDoc.mimeType).toUpperCase()} • Stored in DB
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
                      className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-primary/[0.02] hover:border-primary/30 cursor-pointer transition-colors"
                    >
                      {isSavingBanner ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <Upload className="h-6 w-6 text-muted-foreground/60" />
                      )}
                      <span className="text-sm font-medium text-muted-foreground">
                        {isSavingBanner ? "Uploading banner..." : "Click to upload banner image"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Supports PNG, JPG up to 8MB
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
              <Card className="rounded-2xl animate-fade-in-up stagger-3">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    Live Render Preview
                  </CardTitle>
                  <CardDescription className="text-sm">
                    This is how the signature will look when attached to outgoing client emails.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted/50 border rounded-lg p-6 relative overflow-hidden">
                    <div className="absolute top-3 right-3">
                      <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary text-[10px]">
                        {signatureDoc?.isActive !== false ? "Active Default" : "Inactive"}
                      </Badge>
                    </div>
                    
                    <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-4 border-b pb-2">
                      ✉️ Signature Output
                    </div>

                    <div 
                      className="text-foreground prose prose-sm max-w-none font-sans"
                      dangerouslySetInnerHTML={{ 
                        __html: customBannerDoc?.content 
                          ? sigValue.replace(
                              "cid:signature_banner_image", 
                              customBannerDoc.content.startsWith("http") ? customBannerDoc.content : `data:${customBannerDoc.mimeType};base64,${customBannerDoc.content}`
                            )
                          : sigValue
                              .replace(/<div[^>]*>\s*<img[^>]*src="cid:signature_banner_image"[^>]*>\s*<\/div>/i, "")
                              .replace(/<img[^>]*src="cid:signature_banner_image"[^>]*>/i, "")
                      }} 
                    />
                  </div>

                  <div className="text-xs text-muted-foreground bg-primary/[0.03] border border-primary/10 rounded-lg p-3">
                    💡 <strong>Pro-Tip:</strong> The rich text editor allows toggling between <strong>Visual Mode</strong> and <strong>HTML Code Mode</strong>. To embed high-end graphic layout components, switch to HTML Mode and configure styles inline.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
