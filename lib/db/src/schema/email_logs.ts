import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { templatesTable } from "./templates";

export const emailStatusEnum = pgEnum("email_status", ["sent", "failed", "pending"]);
export const errorTypeEnum = pgEnum("error_type", ["smtp_failed", "invalid_email", "blocked", "limit_reached", "auth_error", "unknown"]);

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id, { onDelete: "cascade" }),
  templateId: integer("template_id").references(() => templatesTable.id, { onDelete: "set null" }),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  status: emailStatusEnum("status").notNull().default("pending"),
  errorType: errorTypeEnum("error_type"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  selectedCatalogIds: integer("selected_catalog_ids").array(),
  errorDetails: text("error_details"), // Store JSON string for simplicity
});

export const insertEmailLogSchema = createInsertSchema(emailLogsTable).omit({ id: true, createdAt: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogsTable.$inferSelect;
