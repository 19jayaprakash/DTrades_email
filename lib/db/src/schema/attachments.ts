import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const attachmentsTable = pgTable("attachments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/pdf"),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;
