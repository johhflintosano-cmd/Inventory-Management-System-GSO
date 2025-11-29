import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "employee"] }).notNull().default("employee"),
  isApproved: boolean("is_approved").notNull().default(true), // Auto-approved
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isApproved: true,
  approvedBy: true,
  approvedAt: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, 'password'>;

// Categories table (simplified - no subcategories)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Inventory items table - completely rebuilt with new fields
export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplier: text("supplier").notNull(),
  dateReceived: timestamp("date_received").notNull().default(sql`now()`),
  quantity: integer("quantity").notNull().default(0),
  unitOfMeasure: text("unit_of_measure").notNull().default("pcs"), // pcs, boxes, kg, etc.
  itemName: text("item_name").notNull(), // Items delivered
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  location: text("location").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"), // quantity * unitCost
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// Category history table - tracks changes per category (purchases, modifications)
export const categoryHistory = pgTable("category_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  changeType: text("change_type", { 
    enum: ["purchase", "quantity_change", "location_change", "cost_change", "item_added"] 
  }).notNull(),
  previousValue: jsonb("previous_value"), // Before value
  newValue: jsonb("new_value"), // After value
  changedBy: varchar("changed_by").references(() => users.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at").notNull().default(sql`now()`),
});

export const insertCategoryHistorySchema = createInsertSchema(categoryHistory).omit({
  id: true,
  changedAt: true,
});

export type InsertCategoryHistory = z.infer<typeof insertCategoryHistorySchema>;
export type CategoryHistory = typeof categoryHistory.$inferSelect;

// Inventory requests table - for employee submissions pending admin approval
// Supports both single items and bulk submissions
export const inventoryRequests = pgTable("inventory_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestType: text("request_type", { enum: ["single", "bulk"] }).notNull().default("single"),
  // Items array - each item has: supplier, quantity, unitOfMeasure, itemName, location, unitCost, amount, remarks
  items: jsonb("items").notNull(), // Array of item objects
  // For bulk: tracks approval status of each item
  // Format: { "0": { status: "approved" }, "1": { status: "denied", reason: "wrong_quantity" } }
  itemStatuses: jsonb("item_statuses"),
  status: text("status", { enum: ["pending", "approved", "denied", "partial"] }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertInventoryRequestSchema = createInsertSchema(inventoryRequests).omit({
  id: true,
  status: true,
  itemStatuses: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true,
});

export type InsertInventoryRequest = z.infer<typeof insertInventoryRequestSchema>;
export type InventoryRequest = typeof inventoryRequests.$inferSelect;

// Denial reasons enum for reference
export const denialReasons = [
  "wrong_item_name",
  "wrong_location", 
  "wrong_quantity",
  "wrong_unit_of_measure",
  "wrong_unit_cost",
  "wrong_amount",
  "other"
] as const;

export type DenialReason = typeof denialReasons[number];

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["success", "alert", "info"] }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetRoute: text("target_route"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  read: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Chat messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  read: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Reports table
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type", { enum: ["receiving_report", "inventory_summary", "custom"] }).notNull(),
  dateRange: text("date_range").notNull(),
  data: jsonb("data").notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessGrantedTo: text("access_granted_to").array(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// Audit events table
export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type", { enum: ["inventory", "user", "category", "request"] }).notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action", { enum: ["create", "update", "delete", "approve", "deny"] }).notNull(),
  actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorSnapshot: jsonb("actor_snapshot"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

// Item payload schema for requests
export const itemPayloadSchema = z.object({
  supplier: z.string().min(1, "Supplier is required"),
  quantity: z.number().int().positive("Quantity must be positive"),
  unitOfMeasure: z.string().min(1, "Unit of measure is required"),
  itemName: z.string().min(1, "Item name is required"),
  location: z.string().min(1, "Location is required"),
  unitCost: z.number().nonnegative("Unit cost must be non-negative"),
  amount: z.number().nonnegative("Amount must be non-negative"),
  remarks: z.string().optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(), // For auto-categorization
});

export type ItemPayload = z.infer<typeof itemPayloadSchema>;

// Released Order Requests - for employee submissions pending admin approval
export const releasedOrderRequests = pgTable("released_order_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employeeId: varchar("employee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  departmentOffice: text("department_office").notNull(),
  rsNo: text("rs_no"), // Requisition Slip Number
  isPartial: boolean("is_partial").notNull().default(false),
  // Items array - each item has: inventoryItemId, quantity, unit, particulars (itemName), unitCost, amount, remarks
  items: jsonb("items").notNull(),
  // Tracks approval status of each item: { "0": { status: "approved" }, "1": { status: "denied", reason: "..." } }
  itemStatuses: jsonb("item_statuses"),
  status: text("status", { enum: ["pending", "approved", "denied", "partial"] }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertReleasedOrderRequestSchema = createInsertSchema(releasedOrderRequests).omit({
  id: true,
  status: true,
  itemStatuses: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true,
});

export type InsertReleasedOrderRequest = z.infer<typeof insertReleasedOrderRequestSchema>;
export type ReleasedOrderRequest = typeof releasedOrderRequests.$inferSelect;

// Released Order Reports - stores generated reports
export const releasedOrderReports = pgTable("released_order_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sroNo: text("sro_no").notNull(), // Supplies Release Order Number
  rsNo: text("rs_no"), // Requisition Slip Number
  departmentOffice: text("department_office").notNull(),
  isPartial: boolean("is_partial").notNull().default(false),
  // Items that were released
  items: jsonb("items").notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  releasedBy: varchar("released_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  receivedBy: text("received_by"), // Name of the person who received
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertReleasedOrderReportSchema = createInsertSchema(releasedOrderReports).omit({
  id: true,
  createdAt: true,
});

export type InsertReleasedOrderReport = z.infer<typeof insertReleasedOrderReportSchema>;
export type ReleasedOrderReport = typeof releasedOrderReports.$inferSelect;

// Released item payload schema
export const releasedItemPayloadSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().int().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  particulars: z.string().min(1, "Particulars (item name) is required"),
  unitCost: z.number().nonnegative("Unit cost must be non-negative"),
  amount: z.number().nonnegative("Amount must be non-negative"),
  remarks: z.string().optional(),
});

export type ReleasedItemPayload = z.infer<typeof releasedItemPayloadSchema>;
