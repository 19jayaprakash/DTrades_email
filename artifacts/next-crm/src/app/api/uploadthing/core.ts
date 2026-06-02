import { createUploadthing, type FileRouter } from "uploadthing/next";
import { requireAuth } from "@/lib/auth";

const f = createUploadthing();

export const ourFileRouter = {
  /** PDF/document catalog brochures — up to 64 MB */
  catalogUploader: f({
    "application/pdf": { maxFileSize: "64MB", maxFileCount: 1 },
    "application/msword": { maxFileSize: "64MB", maxFileCount: 1 },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "64MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const user = await requireAuth(req as unknown as Request);
      if (!user || user.role !== "admin") throw new Error("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),

  /** Signature banner images — up to 16 MB */
  bannerUploader: f({
    image: { maxFileSize: "16MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const user = await requireAuth(req as unknown as Request);
      if (!user || user.role !== "admin") throw new Error("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ file }) => {
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
