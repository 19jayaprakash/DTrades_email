import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("catalog"), // 'terms', 'catalog', or 'signature'
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const attachmentContentsTable = pgTable("attachment_contents", {
  attachmentId: integer("attachment_id").primaryKey().references(() => attachmentsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
});

export const userAttachmentsTable = pgTable("user_attachments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  attachmentId: integer("attachment_id").notNull().references(() => attachmentsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;
export type AttachmentContent = typeof attachmentContentsTable.$inferSelect;
export type UserAttachment = typeof userAttachmentsTable.$inferSelect;

