import { db } from "./db";
import { 
  users, inventoryItems, categories, inventoryRequests, categoryHistory,
  notifications, chatMessages, reports, auditEvents,
  releasedOrderRequests, releasedOrderReports,
  type InsertUser, type User, type SafeUser,
  type InsertInventoryItem, type InventoryItem,
  type InsertCategory, type Category,
  type InsertInventoryRequest, type InventoryRequest,
  type InsertCategoryHistory, type CategoryHistory,
  type InsertNotification, type Notification,
  type InsertChatMessage, type ChatMessage,
  type InsertReport, type Report,
  type InsertAuditEvent, type AuditEvent,
  type InsertReleasedOrderRequest, type ReleasedOrderRequest,
  type InsertReleasedOrderReport, type ReleasedOrderReport
} from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<SafeUser[]>;
  getPendingUsers(): Promise<SafeUser[]>;
  approveUser(id: string, adminId: string): Promise<void>;
  denyUser(id: string): Promise<void>;
  updateUserRole(id: string, role: "admin" | "employee"): Promise<void>;
  deleteUser(id: string): Promise<void>;
  countUsers(): Promise<number>;

  // Category operations
  createCategory(category: InsertCategory): Promise<Category>;
  getCategoryById(id: string): Promise<Category | undefined>;
  getCategoryByName(name: string): Promise<Category | undefined>;
  getAllCategories(): Promise<Category[]>;
  deleteCategory(id: string): Promise<void>;

  // Category History operations
  addCategoryHistory(history: InsertCategoryHistory): Promise<CategoryHistory>;
  getCategoryHistory(categoryId: string): Promise<CategoryHistory[]>;

  // Inventory operations
  createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem>;
  getInventoryItemById(id: string): Promise<InventoryItem | undefined>;
  getAllInventoryItems(): Promise<InventoryItem[]>;
  getInventoryItemsByCategory(categoryId: string): Promise<InventoryItem[]>;
  updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: string): Promise<void>;

  // Inventory request operations (replaces permission requests)
  createInventoryRequest(request: InsertInventoryRequest): Promise<InventoryRequest>;
  getInventoryRequestById(id: string): Promise<InventoryRequest | undefined>;
  getInventoryRequestsByEmployee(employeeId: string): Promise<InventoryRequest[]>;
  getPendingInventoryRequests(): Promise<InventoryRequest[]>;
  getAllInventoryRequests(): Promise<InventoryRequest[]>;
  updateInventoryRequestStatus(id: string, status: "approved" | "denied" | "partial", reviewedBy: string, itemStatuses?: Record<string, { status: string; reason?: string }>): Promise<void>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationsCount(userId: string): Promise<number>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(userId: string, otherUserId?: string): Promise<ChatMessage[]>;
  markChatMessageAsRead(id: string): Promise<void>;

  // Report operations
  createReport(report: InsertReport): Promise<Report>;
  getReportById(id: string): Promise<Report | undefined>;
  getReportsByUser(userId: string): Promise<Report[]>;
  getAllReports(): Promise<Report[]>;

  // Audit event operations
  logAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(options?: { entityType?: "inventory" | "user" | "category" | "request"; limit?: number }): Promise<AuditEvent[]>;

  // Released Order Request operations
  createReleasedOrderRequest(request: InsertReleasedOrderRequest): Promise<ReleasedOrderRequest>;
  getReleasedOrderRequestById(id: string): Promise<ReleasedOrderRequest | undefined>;
  getReleasedOrderRequestsByEmployee(employeeId: string): Promise<ReleasedOrderRequest[]>;
  getPendingReleasedOrderRequests(): Promise<ReleasedOrderRequest[]>;
  getAllReleasedOrderRequests(): Promise<ReleasedOrderRequest[]>;
  updateReleasedOrderRequestStatus(id: string, status: "approved" | "denied" | "partial", reviewedBy: string, itemStatuses?: Record<string, { status: string; reason?: string }>): Promise<void>;

  // Released Order Report operations
  createReleasedOrderReport(report: InsertReleasedOrderReport): Promise<ReleasedOrderReport>;
  getReleasedOrderReportById(id: string): Promise<ReleasedOrderReport | undefined>;
  getAllReleasedOrderReports(): Promise<ReleasedOrderReport[]>;
  getReleasedOrderReportsByUser(userId: string): Promise<ReleasedOrderReport[]>;
}

export class DbStorage implements IStorage {
  // User operations
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<SafeUser[]> {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      isApproved: users.isApproved,
      approvedBy: users.approvedBy,
      approvedAt: users.approvedAt,
    }).from(users).where(eq(users.isApproved, true)).orderBy(desc(users.createdAt));
    return allUsers;
  }

  async getPendingUsers(): Promise<SafeUser[]> {
    const pendingUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      isApproved: users.isApproved,
      approvedBy: users.approvedBy,
      approvedAt: users.approvedAt,
    }).from(users).where(eq(users.isApproved, false)).orderBy(desc(users.createdAt));
    return pendingUsers;
  }

  async approveUser(id: string, adminId: string): Promise<void> {
    await db.update(users).set({ 
      isApproved: true, 
      approvedBy: adminId,
      approvedAt: new Date()
    }).where(eq(users.id, id));
  }

  async denyUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async updateUserRole(id: string, role: "admin" | "employee"): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    // First, remove user from accessGrantedTo arrays in reports
    const allReports = await db.select().from(reports);
    for (const report of allReports) {
      if (report.accessGrantedTo && report.accessGrantedTo.includes(id)) {
        const updatedAccess = report.accessGrantedTo.filter(userId => userId !== id);
        await db.update(reports)
          .set({ accessGrantedTo: updatedAccess.length > 0 ? updatedAccess : null })
          .where(eq(reports.id, report.id));
      }
    }
    
    // Then delete the user (cascading deletes will handle related records)
    await db.delete(users).where(eq(users.id, id));
  }

  async countUsers(): Promise<number> {
    const result = await db.select({ count: sql`count(*)` }).from(users);
    return Number(result[0].count);
  }

  // Category operations
  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const [category] = await db.insert(categories).values(insertCategory).returning();
    return category;
  }

  async getCategoryById(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async getCategoryByName(name: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.name, name));
    return category;
  }

  async getAllCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.name);
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Category History operations
  async addCategoryHistory(history: InsertCategoryHistory): Promise<CategoryHistory> {
    const [historyRecord] = await db.insert(categoryHistory).values(history).returning();
    return historyRecord;
  }

  async getCategoryHistory(categoryId: string): Promise<CategoryHistory[]> {
    return db.select().from(categoryHistory)
      .where(eq(categoryHistory.categoryId, categoryId))
      .orderBy(desc(categoryHistory.changedAt));
  }

  // Inventory operations
  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [inventoryItem] = await db.insert(inventoryItems).values(item).returning();
    return inventoryItem;
  }

  async getInventoryItemById(id: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return item;
  }

  async getAllInventoryItems(): Promise<InventoryItem[]> {
    return db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt));
  }

  async getInventoryItemsByCategory(categoryId: string): Promise<InventoryItem[]> {
    return db.select().from(inventoryItems)
      .where(eq(inventoryItems.categoryId, categoryId))
      .orderBy(desc(inventoryItems.createdAt));
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [updated] = await db.update(inventoryItems)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<void> {
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  }

  // Inventory request operations
  async createInventoryRequest(request: InsertInventoryRequest): Promise<InventoryRequest> {
    const [invRequest] = await db.insert(inventoryRequests).values(request).returning();
    return invRequest;
  }

  async getInventoryRequestById(id: string): Promise<InventoryRequest | undefined> {
    const [request] = await db.select().from(inventoryRequests).where(eq(inventoryRequests.id, id));
    return request;
  }

  async getInventoryRequestsByEmployee(employeeId: string): Promise<InventoryRequest[]> {
    return db.select().from(inventoryRequests)
      .where(eq(inventoryRequests.employeeId, employeeId))
      .orderBy(desc(inventoryRequests.createdAt));
  }

  async getPendingInventoryRequests(): Promise<InventoryRequest[]> {
    return db.select().from(inventoryRequests)
      .where(eq(inventoryRequests.status, "pending"))
      .orderBy(desc(inventoryRequests.createdAt));
  }

  async getAllInventoryRequests(): Promise<InventoryRequest[]> {
    return db.select().from(inventoryRequests)
      .orderBy(desc(inventoryRequests.createdAt));
  }

  async updateInventoryRequestStatus(
    id: string, 
    status: "approved" | "denied" | "partial", 
    reviewedBy: string,
    itemStatuses?: Record<string, { status: string; reason?: string }>
  ): Promise<void> {
    const updateData: any = { 
      status, 
      reviewedBy, 
      reviewedAt: new Date() 
    };
    
    if (itemStatuses) {
      updateData.itemStatuses = itemStatuses;
    }
    
    await db.update(inventoryRequests)
      .set(updateData)
      .where(eq(inventoryRequests.id, id));
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(notification).returning();
    return notif;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));
    return Number(result[0]?.count || 0);
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  // Chat operations
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMsg] = await db.insert(chatMessages).values(message).returning();
    return chatMsg;
  }

  async getChatMessages(userId: string, otherUserId?: string): Promise<ChatMessage[]> {
    if (otherUserId) {
      return db.select().from(chatMessages)
        .where(
          or(
            and(eq(chatMessages.senderId, userId), eq(chatMessages.receiverId, otherUserId)),
            and(eq(chatMessages.senderId, otherUserId), eq(chatMessages.receiverId, userId))
          )
        )
        .orderBy(chatMessages.createdAt);
    }
    return db.select().from(chatMessages)
      .where(or(
        eq(chatMessages.senderId, userId),
        eq(chatMessages.receiverId, userId)
      ))
      .orderBy(chatMessages.createdAt);
  }

  async markChatMessageAsRead(id: string): Promise<void> {
    await db.update(chatMessages).set({ read: true }).where(eq(chatMessages.id, id));
  }

  // Report operations
  async createReport(report: InsertReport): Promise<Report> {
    const [newReport] = await db.insert(reports).values(report).returning();
    return newReport;
  }

  async getReportById(id: string): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id));
    return report;
  }

  async getReportsByUser(userId: string): Promise<Report[]> {
    return db.select().from(reports)
      .where(or(
        eq(reports.createdBy, userId),
        sql`${userId} = ANY(${reports.accessGrantedTo})`
      ))
      .orderBy(desc(reports.createdAt));
  }

  async getAllReports(): Promise<Report[]> {
    return db.select().from(reports).orderBy(desc(reports.createdAt));
  }

  // Audit event operations
  async logAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [auditEvent] = await db.insert(auditEvents).values(event).returning();
    return auditEvent;
  }

  async getAuditEvents(options?: { entityType?: "inventory" | "user" | "category" | "request"; limit?: number }): Promise<AuditEvent[]> {
    const limit = options?.limit || 100;
    
    if (options?.entityType) {
      return db.select().from(auditEvents)
        .where(eq(auditEvents.entityType, options.entityType))
        .orderBy(desc(auditEvents.createdAt))
        .limit(limit);
    }
    
    return db.select().from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }

  // Released Order Request operations
  async createReleasedOrderRequest(request: InsertReleasedOrderRequest): Promise<ReleasedOrderRequest> {
    const [newRequest] = await db.insert(releasedOrderRequests).values(request).returning();
    return newRequest;
  }

  async getReleasedOrderRequestById(id: string): Promise<ReleasedOrderRequest | undefined> {
    const [request] = await db.select().from(releasedOrderRequests).where(eq(releasedOrderRequests.id, id));
    return request;
  }

  async getReleasedOrderRequestsByEmployee(employeeId: string): Promise<ReleasedOrderRequest[]> {
    return db.select().from(releasedOrderRequests)
      .where(eq(releasedOrderRequests.employeeId, employeeId))
      .orderBy(desc(releasedOrderRequests.createdAt));
  }

  async getPendingReleasedOrderRequests(): Promise<ReleasedOrderRequest[]> {
    return db.select().from(releasedOrderRequests)
      .where(eq(releasedOrderRequests.status, "pending"))
      .orderBy(desc(releasedOrderRequests.createdAt));
  }

  async getAllReleasedOrderRequests(): Promise<ReleasedOrderRequest[]> {
    return db.select().from(releasedOrderRequests)
      .orderBy(desc(releasedOrderRequests.createdAt));
  }

  async updateReleasedOrderRequestStatus(
    id: string, 
    status: "approved" | "denied" | "partial", 
    reviewedBy: string,
    itemStatuses?: Record<string, { status: string; reason?: string }>
  ): Promise<void> {
    const updateData: any = { 
      status, 
      reviewedBy, 
      reviewedAt: new Date() 
    };
    
    if (itemStatuses) {
      updateData.itemStatuses = itemStatuses;
    }
    
    await db.update(releasedOrderRequests)
      .set(updateData)
      .where(eq(releasedOrderRequests.id, id));
  }

  // Released Order Report operations
  async createReleasedOrderReport(report: InsertReleasedOrderReport): Promise<ReleasedOrderReport> {
    const [newReport] = await db.insert(releasedOrderReports).values(report).returning();
    return newReport;
  }

  async getReleasedOrderReportById(id: string): Promise<ReleasedOrderReport | undefined> {
    const [report] = await db.select().from(releasedOrderReports).where(eq(releasedOrderReports.id, id));
    return report;
  }

  async getAllReleasedOrderReports(): Promise<ReleasedOrderReport[]> {
    return db.select().from(releasedOrderReports).orderBy(desc(releasedOrderReports.createdAt));
  }

  async getReleasedOrderReportsByUser(userId: string): Promise<ReleasedOrderReport[]> {
    return db.select().from(releasedOrderReports)
      .where(eq(releasedOrderReports.releasedBy, userId))
      .orderBy(desc(releasedOrderReports.createdAt));
  }
}

export const storage = new DbStorage();
