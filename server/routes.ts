import "./types";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { requireAuth, requireRole } from "./middleware/auth";
import { 
  insertUserSchema, insertInventoryItemSchema, insertInventoryRequestSchema,
  insertNotificationSchema, insertChatMessageSchema, insertReportSchema, insertCategorySchema,
  insertReleasedOrderRequestSchema, insertReleasedOrderReportSchema, releasedItemPayloadSchema,
  itemPayloadSchema, denialReasons
} from "@shared/schema";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateRoleSchema = z.object({
  role: z.enum(["admin", "employee"]),
});

// Schema for reviewing requests with item-level decisions for bulk
const reviewRequestSchema = z.object({
  status: z.enum(["approved", "denied", "partial"]),
  itemDecisions: z.array(z.object({
    index: z.number(),
    status: z.enum(["approved", "denied"]),
    reason: z.enum(denialReasons).optional(),
  })).optional(),
});

// Schema for reviewing released order requests
const reviewReleasedOrderSchema = z.object({
  status: z.enum(["approved", "denied", "partial"]),
  itemDecisions: z.array(z.object({
    index: z.number(),
    status: z.enum(["approved", "denied"]),
    reason: z.string().optional(),
  })).optional(),
});

// Schema for creating released order request
const createReleasedOrderRequestSchema = z.object({
  departmentOffice: z.string().min(1, "Department/Office is required"),
  rsNo: z.string().optional(),
  isPartial: z.boolean().optional(),
  items: z.array(releasedItemPayloadSchema).min(1, "At least one item is required"),
});

// Schema for generating released order report (admin or approved employee)
const generateReleasedOrderSchema = z.object({
  requestId: z.string().optional(), // For employee with approved request
  items: z.array(releasedItemPayloadSchema).optional(), // For direct admin generation
  departmentOffice: z.string().min(1),
  rsNo: z.string().optional(),
  isPartial: z.boolean().optional(),
  receivedBy: z.string().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      credentials: true
    }
  });

  // Socket.IO connection handling
  io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} connected to socket`);
    }

    socket.on("disconnect", () => {
      console.log("User disconnected from socket");
    });
  });

  // Helper function to emit notifications
  const emitNotification = (userId: string, notification: any) => {
    io.to(`user:${userId}`).emit("notification", notification);
  };

  // Helper function to emit inventory changes
  const emitInventoryChange = (type: 'create' | 'update' | 'delete', item: any) => {
    io.emit("inventory_change", { type, item });
  };

  // Helper function to emit user changes
  const emitUserChange = (type: 'create' | 'update' | 'delete', user: any) => {
    io.emit("user_change", { type, user });
  };

  // Helper function to emit request changes
  const emitRequestChange = (type: 'create' | 'update' | 'delete', request: any) => {
    io.emit("request_change", { type, request });
  };

  // Auth Routes
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const data = insertUserSchema.parse(req.body);
      
      // Password validation: at least 7 alphabetic characters AND at least 1 numeric digit
      const alphabeticCount = (data.password.match(/[a-zA-Z]/g) || []).length;
      const numericCount = (data.password.match(/[0-9]/g) || []).length;
      
      if (alphabeticCount < 7 || numericCount < 1) {
        return res.status(400).json({ 
          message: "Please enter at least more than 7 letters and enter at least a number (eg, HBisD657)" 
        });
      }
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Check if this is the first user (becomes admin automatically)
      const userCount = await storage.countUsers();
      const isFirstUser = userCount === 0;

      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Create user - use role from request, first user defaults to admin if not specified
      const requestedRole = data.role || (isFirstUser ? 'admin' : 'employee');
      const user = await storage.createUser({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: requestedRole,
      });

      // Log audit event for user creation
      await storage.logAuditEvent({
        entityType: 'user',
        entityId: user.id,
        action: 'create',
        actorId: null,
        before: null,
        after: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved,
        },
        actorSnapshot: null,
      });

      // Emit user change event
      const { password: _, ...safeUser } = user;
      if (isFirstUser) {
        emitUserChange('create', safeUser);
      }

      // Set session immediately after registration (auto-login)
      req.session.userId = user.id;
      req.session.role = user.role;

      const { password: __, ...userWithoutPassword } = user;
      res.json({ 
        user: userWithoutPassword, 
        requires2FA: false,
        message: "Registration successful! You are now logged in." 
      });
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Set session directly (no 2FA)
      req.session.userId = user.id;
      req.session.role = user.role;

      res.json({ 
        message: "Login successful",
        requires2FA: false,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    req.session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Category Routes
  app.get("/api/categories", requireAuth, async (req: Request, res: Response) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/categories", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertCategorySchema.parse(req.body);
      const role = req.session.role;
      
      // Admins can create immediately, employees need approval (handled via requests)
      if (role !== "admin") {
        return res.status(403).json({ message: "Only admins can create categories directly" });
      }
      
      const existing = await storage.getCategoryByName(data.name);
      if (existing) {
        return res.status(400).json({ message: "Category already exists" });
      }

      const category = await storage.createCategory(data);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Category history route
  app.get("/api/categories/:id/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const history = await storage.getCategoryHistory(id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Inventory Routes
  app.get("/api/inventory", requireAuth, async (req: Request, res: Response) => {
    try {
      const items = await storage.getAllInventoryItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const item = await storage.getInventoryItemById(id);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin direct add - bypasses approval
  app.post("/api/inventory", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      
      // Accept either itemPayloadSchema (with categoryName) or insertInventoryItemSchema
      const validated = itemPayloadSchema.parse(req.body);
      
      // Get or create category from categoryName
      let categoryId = null;
      if (validated.categoryName) {
        const existing = await storage.getCategoryByName(validated.categoryName);
        if (existing) {
          categoryId = existing.id;
        } else {
          const newCat = await storage.createCategory({ name: validated.categoryName });
          categoryId = newCat.id;
        }
      } else if (req.body.categoryId) {
        categoryId = req.body.categoryId;
      }
      
      // Calculate amount
      const amount = validated.amount || (validated.quantity * validated.unitCost);
      
      const item = await storage.createInventoryItem({
        supplier: validated.supplier,
        quantity: validated.quantity,
        unitOfMeasure: validated.unitOfMeasure,
        itemName: validated.itemName,
        categoryId,
        location: validated.location,
        unitCost: validated.unitCost.toString(),
        amount: amount.toFixed(2),
        remarks: validated.remarks || null,
        dateReceived: new Date(),
      });
      
      // Log to category history if category exists
      if (item.categoryId) {
        await storage.addCategoryHistory({
          categoryId: item.categoryId,
          itemId: item.id,
          changeType: "item_added",
          previousValue: null,
          newValue: {
            itemName: item.itemName,
            quantity: item.quantity,
            location: item.location,
            unitCost: item.unitCost,
          },
          changedBy: userId,
        });
      }
      
      // Log audit event
      const actor = await storage.getUserById(userId);
      if (actor) {
        await storage.logAuditEvent({
          entityType: "inventory",
          entityId: item.id,
          action: "create",
          actorId: userId,
          actorSnapshot: { name: actor.name, email: actor.email },
          before: null,
          after: { itemName: item.itemName, quantity: item.quantity, location: item.location },
        });
      }
      
      emitInventoryChange('create', item);
      res.json(item);
    } catch (error) {
      console.error('Inventory create error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin bulk add - bypasses approval
  app.post("/api/inventory/bulk", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { items } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const createdItems = [];
      const actor = await storage.getUserById(userId);

      for (const itemData of items) {
        const validated = itemPayloadSchema.parse(itemData);
        
        // Get or create category
        let categoryId = null;
        if (validated.categoryName) {
          const existing = await storage.getCategoryByName(validated.categoryName);
          if (existing) {
            categoryId = existing.id;
          } else {
            const newCat = await storage.createCategory({ name: validated.categoryName });
            categoryId = newCat.id;
          }
        }

        const amount = (validated.quantity * validated.unitCost).toFixed(2);
        
        const item = await storage.createInventoryItem({
          supplier: validated.supplier,
          quantity: validated.quantity,
          unitOfMeasure: validated.unitOfMeasure,
          itemName: validated.itemName,
          categoryId,
          location: validated.location,
          unitCost: validated.unitCost.toString(),
          amount,
          remarks: validated.remarks || null,
          dateReceived: new Date(),
        });

        createdItems.push(item);

        // Log to category history
        if (categoryId) {
          await storage.addCategoryHistory({
            categoryId,
            itemId: item.id,
            changeType: "item_added",
            previousValue: null,
            newValue: {
              itemName: item.itemName,
              quantity: item.quantity,
              location: item.location,
            },
            changedBy: userId,
          });
        }

        // Log audit event
        if (actor) {
          await storage.logAuditEvent({
            entityType: "inventory",
            entityId: item.id,
            action: "create",
            actorId: userId,
            actorSnapshot: { name: actor.name, email: actor.email },
            before: null,
            after: { itemName: item.itemName, quantity: item.quantity },
          });
        }

        emitInventoryChange('create', item);
      }

      res.json({ items: createdItems, count: createdItems.length });
    } catch (error) {
      console.error('Bulk inventory create error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/inventory/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;
      const data = insertInventoryItemSchema.partial().parse(req.body);
      
      const before = await storage.getInventoryItemById(id);
      if (!before) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Recalculate amount if quantity or unitCost changed
      let updateData = { ...data };
      if (data.quantity !== undefined || data.unitCost !== undefined) {
        const newQty = data.quantity ?? before.quantity;
        const newCost = data.unitCost ?? before.unitCost;
        updateData.amount = (Number(newQty) * Number(newCost)).toFixed(2);
      }
      
      const updated = await storage.updateInventoryItem(id, updateData);
      
      // Log to category history if relevant fields changed
      if (before.categoryId && (data.quantity !== undefined || data.location !== undefined || data.unitCost !== undefined)) {
        const changeType = data.quantity !== undefined ? "quantity_change" : 
                          data.location !== undefined ? "location_change" : "cost_change";
        
        await storage.addCategoryHistory({
          categoryId: before.categoryId,
          itemId: id,
          changeType,
          previousValue: {
            quantity: before.quantity,
            location: before.location,
            unitCost: before.unitCost,
          },
          newValue: {
            quantity: updated?.quantity,
            location: updated?.location,
            unitCost: updated?.unitCost,
          },
          changedBy: userId,
        });
      }
      
      // Log audit event
      const actor = await storage.getUserById(userId);
      if (actor && updated) {
        await storage.logAuditEvent({
          entityType: "inventory",
          entityId: updated.id,
          action: "update",
          actorId: userId,
          actorSnapshot: { name: actor.name, email: actor.email },
          before: { itemName: before.itemName, quantity: before.quantity },
          after: { itemName: updated.itemName, quantity: updated.quantity },
        });
      }
      
      emitInventoryChange('update', updated);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/inventory/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId!;
      
      const before = await storage.getInventoryItemById(id);
      if (!before) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      await storage.deleteInventoryItem(id);
      
      // Log audit event
      const actor = await storage.getUserById(userId);
      if (actor) {
        await storage.logAuditEvent({
          entityType: "inventory",
          entityId: id,
          action: "delete",
          actorId: userId,
          actorSnapshot: { name: actor.name, email: actor.email },
          before: { itemName: before.itemName, quantity: before.quantity },
          after: null,
        });
      }
      
      emitInventoryChange('delete', { id });
      res.json({ message: "Item deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Inventory Request Routes (Employee submissions for admin approval)
  app.get("/api/requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role;

      let requests;
      if (role === "admin") {
        requests = await storage.getAllInventoryRequests();
      } else {
        requests = await storage.getInventoryRequestsByEmployee(userId);
      }

      // Enrich with employee details
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const employee = await storage.getUserById(request.employeeId);
          return {
            ...request,
            employee: employee ? {
              id: employee.id,
              name: employee.name,
              email: employee.email,
            } : null,
          };
        })
      );

      res.json(enrichedRequests);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Employee submit single item request
  app.post("/api/requests/single", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const itemData = itemPayloadSchema.parse(req.body);
      
      const request = await storage.createInventoryRequest({
        employeeId: userId,
        requestType: "single",
        items: [itemData],
      });

      // Notify all admins
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin");
      const employee = await storage.getUserById(userId);
      
      for (const admin of admins) {
        const notification = await storage.createNotification({
          userId: admin.id,
          type: "alert",
          title: "New Item Request",
          message: `${employee?.name || 'An employee'} submitted a new item: ${itemData.itemName}`,
          targetRoute: "/requests",
        });
        emitNotification(admin.id, notification);
      }

      emitRequestChange('create', request);
      res.json(request);
    } catch (error) {
      console.error('Single request error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Employee submit bulk items request
  app.post("/api/requests/bulk", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { items, supplier } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      // Validate each item and apply shared supplier if provided
      const validatedItems = items.map(item => {
        const validated = itemPayloadSchema.parse({
          ...item,
          supplier: item.supplier || supplier,
        });
        return validated;
      });
      
      const request = await storage.createInventoryRequest({
        employeeId: userId,
        requestType: "bulk",
        items: validatedItems,
      });

      // Notify all admins
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin");
      const employee = await storage.getUserById(userId);
      
      for (const admin of admins) {
        const notification = await storage.createNotification({
          userId: admin.id,
          type: "alert",
          title: "New Bulk Item Request",
          message: `${employee?.name || 'An employee'} submitted ${validatedItems.length} items for approval`,
          targetRoute: "/requests",
        });
        emitNotification(admin.id, notification);
      }

      emitRequestChange('create', request);
      res.json(request);
    } catch (error) {
      console.error('Bulk request error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin review request (supports bulk with per-item decisions)
  app.patch("/api/requests/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, itemDecisions } = reviewRequestSchema.parse(req.body);
      const adminId = req.session.userId!;

      const request = await storage.getInventoryRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      const items = request.items as any[];
      const createdItems = [];
      let approvedCount = 0;
      let deniedCount = 0;

      // Build item statuses for bulk requests
      const itemStatuses: Record<string, { status: string; reason?: string }> = {};

      if (request.requestType === "bulk" && itemDecisions) {
        // Process per-item decisions
        for (const decision of itemDecisions) {
          itemStatuses[decision.index.toString()] = {
            status: decision.status,
            reason: decision.reason,
          };
          
          if (decision.status === "approved") {
            approvedCount++;
            const itemData = items[decision.index];
            
            // Get or create category
            let categoryId = null;
            if (itemData.categoryName) {
              const existing = await storage.getCategoryByName(itemData.categoryName);
              if (existing) {
                categoryId = existing.id;
              } else {
                const newCat = await storage.createCategory({ name: itemData.categoryName });
                categoryId = newCat.id;
              }
            }

            const amount = (itemData.quantity * itemData.unitCost).toFixed(2);
            
            const newItem = await storage.createInventoryItem({
              supplier: itemData.supplier,
              quantity: itemData.quantity,
              unitOfMeasure: itemData.unitOfMeasure,
              itemName: itemData.itemName,
              categoryId,
              location: itemData.location,
              unitCost: itemData.unitCost.toString(),
              amount,
              remarks: itemData.remarks || null,
              dateReceived: new Date(),
            });

            createdItems.push(newItem);

            // Log to category history
            if (categoryId) {
              await storage.addCategoryHistory({
                categoryId,
                itemId: newItem.id,
                changeType: "item_added",
                previousValue: null,
                newValue: { itemName: newItem.itemName, quantity: newItem.quantity },
                changedBy: adminId,
              });
            }

            emitInventoryChange('create', newItem);
          } else {
            deniedCount++;
          }
        }

        // Determine final status
        const finalStatus = approvedCount === items.length ? "approved" :
                          deniedCount === items.length ? "denied" : "partial";
        
        await storage.updateInventoryRequestStatus(id, finalStatus, adminId, itemStatuses);
      } else {
        // Single item or approve/deny all
        if (status === "approved") {
          for (let i = 0; i < items.length; i++) {
            const itemData = items[i];
            
            // Get or create category
            let categoryId = null;
            if (itemData.categoryName) {
              const existing = await storage.getCategoryByName(itemData.categoryName);
              if (existing) {
                categoryId = existing.id;
              } else {
                const newCat = await storage.createCategory({ name: itemData.categoryName });
                categoryId = newCat.id;
              }
            }

            const amount = (itemData.quantity * itemData.unitCost).toFixed(2);
            
            const newItem = await storage.createInventoryItem({
              supplier: itemData.supplier,
              quantity: itemData.quantity,
              unitOfMeasure: itemData.unitOfMeasure,
              itemName: itemData.itemName,
              categoryId,
              location: itemData.location,
              unitCost: itemData.unitCost.toString(),
              amount,
              remarks: itemData.remarks || null,
              dateReceived: new Date(),
            });

            createdItems.push(newItem);
            itemStatuses[i.toString()] = { status: "approved" };

            // Log to category history
            if (categoryId) {
              await storage.addCategoryHistory({
                categoryId,
                itemId: newItem.id,
                changeType: "item_added",
                previousValue: null,
                newValue: { itemName: newItem.itemName, quantity: newItem.quantity },
                changedBy: adminId,
              });
            }

            emitInventoryChange('create', newItem);
          }
        } else {
          // All denied
          for (let i = 0; i < items.length; i++) {
            itemStatuses[i.toString()] = { status: "denied" };
          }
        }

        await storage.updateInventoryRequestStatus(id, status, adminId, itemStatuses);
      }

      // Notify employee
      const employee = await storage.getUserById(request.employeeId);
      let notificationMessage = "";
      
      if (status === "approved" || approvedCount === items.length) {
        notificationMessage = createdItems.length === 1 
          ? `Your item "${createdItems[0].itemName}" has been approved and added to inventory!`
          : `All ${createdItems.length} items have been approved and added to inventory!`;
      } else if (status === "denied" || deniedCount === items.length) {
        notificationMessage = "Your request has been denied.";
      } else {
        notificationMessage = `${approvedCount} items approved, ${deniedCount} items denied. Check the request for details.`;
      }

      const notification = await storage.createNotification({
        userId: request.employeeId,
        type: approvedCount > 0 ? "success" : "alert",
        title: approvedCount > 0 ? "Items Approved" : "Request Denied",
        message: notificationMessage,
        targetRoute: approvedCount > 0 ? "/inventory" : "/requests",
      });
      emitNotification(request.employeeId, notification);

      emitRequestChange('update', { ...request, status, itemStatuses });

      res.json({ 
        message: "Request processed", 
        approvedCount, 
        deniedCount,
        createdItems 
      });
    } catch (error) {
      console.error('Request review error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User Routes
  app.get("/api/users", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users/pending", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const users = await storage.getPendingUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/users/:id/role", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { role } = updateRoleSchema.parse(req.body);
      const adminId = req.session.userId!;

      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const oldRole = user.role;
      await storage.updateUserRole(id, role);

      // Log audit event
      const actor = await storage.getUserById(adminId);
      if (actor) {
        await storage.logAuditEvent({
          entityType: "user",
          entityId: id,
          action: "update",
          actorId: adminId,
          actorSnapshot: { name: actor.name, email: actor.email },
          before: { role: oldRole },
          after: { role },
        });
      }

      emitUserChange('update', { id, role });
      res.json({ message: "Role updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/users/:id", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = req.session.userId!;

      if (id === adminId) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }

      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.deleteUser(id);

      // Log audit event
      const actor = await storage.getUserById(adminId);
      if (actor) {
        await storage.logAuditEvent({
          entityType: "user",
          entityId: id,
          action: "delete",
          actorId: adminId,
          actorSnapshot: { name: actor.name, email: actor.email },
          before: { name: user.name, email: user.email, role: user.role },
          after: null,
        });
      }

      emitUserChange('delete', { id });
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Notification Routes
  app.get("/api/notifications", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const count = await storage.getUnreadNotificationsCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.markNotificationAsRead(id);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Chat Routes
  app.get("/api/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { with: otherUserId } = req.query;
      const messages = await storage.getChatMessages(userId, otherUserId as string);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/chat", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const data = insertChatMessageSchema.parse({
        ...req.body,
        senderId: userId,
      });
      
      const message = await storage.createChatMessage(data);
      
      // Emit to receiver
      if (message.receiverId) {
        io.to(`user:${message.receiverId}`).emit("chat_message", message);
      }
      
      res.json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Report Routes
  app.get("/api/reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role;
      
      let reports;
      if (role === "admin") {
        reports = await storage.getAllReports();
      } else {
        reports = await storage.getReportsByUser(userId);
      }
      
      res.json(reports);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/reports", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const data = insertReportSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      
      const report = await storage.createReport(data);
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve the receiving report template (all authenticated users can download for viewing reports)
  app.get("/api/reports/template", requireAuth, async (req: Request, res: Response) => {
    try {
      const templatePath = path.join(process.cwd(), 'attached_assets', 'EXCEL-RECEIVING-REPORT-GSO-IMS_1764397719838.xlsx');
      
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=receiving_report_template.xlsx');
      
      const fileStream = fs.createReadStream(templatePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Template serve error:', error);
      res.status(500).json({ message: "Failed to serve template" });
    }
  });

  // Generate Receiving Report from approved items
  app.post("/api/reports/receiving", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { itemIds, dateRange } = req.body;
      
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "Item IDs are required" });
      }

      // Fetch the items
      const items = await Promise.all(
        itemIds.map(id => storage.getInventoryItemById(id))
      );
      const validItems = items.filter(Boolean);

      // Calculate totals
      const totalAmount = validItems.reduce((sum, item) => sum + Number(item!.amount), 0);
      const totalQuantity = validItems.reduce((sum, item) => sum + item!.quantity, 0);

      const report = await storage.createReport({
        name: `Receiving Report - ${new Date().toLocaleDateString()}`,
        type: "receiving_report",
        dateRange: dateRange || new Date().toLocaleDateString(),
        data: {
          items: validItems,
          totalAmount,
          totalQuantity,
          generatedAt: new Date().toISOString(),
        },
        createdBy: userId,
        accessGrantedTo: [],
      });

      res.json(report);
    } catch (error) {
      console.error('Report generation error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============== RELEASED ORDER ROUTES ==============

  // Create Released Order Request (Employee submits picked items for approval)
  app.post("/api/released-orders/request", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role;
      const data = createReleasedOrderRequestSchema.parse(req.body);

      // If admin, they don't need to create a request - they can directly generate
      if (role === "admin") {
        return res.status(400).json({ 
          message: "Admins can directly generate released orders without approval" 
        });
      }

      // Validate all items exist and have sufficient quantity
      for (const item of data.items) {
        const inventoryItem = await storage.getInventoryItemById(item.inventoryItemId);
        if (!inventoryItem) {
          return res.status(400).json({ 
            message: `Item not found: ${item.particulars}` 
          });
        }
        if (inventoryItem.quantity < item.quantity) {
          return res.status(400).json({ 
            message: `Insufficient quantity for ${item.particulars}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}` 
          });
        }
      }

      const request = await storage.createReleasedOrderRequest({
        employeeId: userId,
        departmentOffice: data.departmentOffice,
        rsNo: data.rsNo,
        isPartial: data.isPartial || false,
        items: data.items,
      });

      // Notify all admins about the new request
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin");
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: "alert",
          title: "New Released Order Request",
          message: `Employee has submitted a released order request for ${data.items.length} item(s)`,
          targetRoute: "/process-released-orders",
        });
        emitNotification(admin.id, { type: "released_order_request" });
      }

      emitRequestChange('create', request);
      res.status(201).json(request);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error('Released order request error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all Released Order Requests (Admin view)
  app.get("/api/released-orders/requests", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const requests = await storage.getAllReleasedOrderRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get pending Released Order Requests (Admin view)
  app.get("/api/released-orders/requests/pending", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const requests = await storage.getPendingReleasedOrderRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get employee's own Released Order Requests
  app.get("/api/released-orders/my-requests", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const requests = await storage.getReleasedOrderRequestsByEmployee(userId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Approve/Deny Released Order Request (Admin only)
  app.post("/api/released-orders/requests/:id/review", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminId = req.session.userId!;
      const data = reviewReleasedOrderSchema.parse(req.body);

      const request = await storage.getReleasedOrderRequestById(id);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ message: "Request already processed" });
      }

      // Build item statuses
      const items = request.items as any[];
      let itemStatuses: Record<string, { status: string; reason?: string }> = {};
      
      if (data.itemDecisions) {
        for (const decision of data.itemDecisions) {
          itemStatuses[decision.index.toString()] = {
            status: decision.status,
            reason: decision.reason,
          };
        }
      } else {
        // All items get the same status
        items.forEach((_, idx) => {
          itemStatuses[idx.toString()] = { status: data.status === "denied" ? "denied" : "approved" };
        });
      }

      await storage.updateReleasedOrderRequestStatus(id, data.status, adminId, itemStatuses);

      // Notify employee
      const statusText = data.status === "approved" ? "approved" : 
                        data.status === "partial" ? "partially approved" : "denied";
      
      await storage.createNotification({
        userId: request.employeeId,
        type: data.status === "denied" ? "alert" : "success",
        title: `Released Order Request ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
        message: `Your released order request has been ${statusText}. ${data.status !== "denied" ? "You can now generate the report." : ""}`,
        targetRoute: "/released-orders",
      });
      
      emitNotification(request.employeeId, { type: "released_order_reviewed" });
      emitRequestChange('update', { ...request, status: data.status });

      res.json({ message: `Request ${statusText}` });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error('Review error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Generate Released Order Report (deducts from inventory)
  app.post("/api/released-orders/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const role = req.session.role;
      const data = generateReleasedOrderSchema.parse(req.body);

      let itemsToRelease: any[] = [];
      let departmentOffice = data.departmentOffice;
      let rsNo = data.rsNo;
      let isPartial = data.isPartial || false;

      // If employee, must have an approved request
      if (role === "employee") {
        if (!data.requestId) {
          return res.status(400).json({ message: "Request ID is required for employees" });
        }

        const request = await storage.getReleasedOrderRequestById(data.requestId);
        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        if (request.employeeId !== userId) {
          return res.status(403).json({ message: "Not authorized to access this request" });
        }

        if (request.status !== "approved" && request.status !== "partial") {
          return res.status(400).json({ message: "Request must be approved before generating report" });
        }

        // Get approved items only
        const allItems = request.items as any[];
        const itemStatuses = (request.itemStatuses || {}) as Record<string, { status: string }>;
        
        itemsToRelease = allItems.filter((_, idx) => 
          itemStatuses[idx.toString()]?.status === "approved"
        );

        departmentOffice = request.departmentOffice;
        rsNo = request.rsNo || undefined;
        isPartial = request.isPartial;
      } else {
        // Admin can generate directly
        if (!data.items || data.items.length === 0) {
          return res.status(400).json({ message: "Items are required" });
        }
        itemsToRelease = data.items;
      }

      // Validate and deduct inventory
      for (const item of itemsToRelease) {
        const inventoryItem = await storage.getInventoryItemById(item.inventoryItemId);
        if (!inventoryItem) {
          return res.status(400).json({ message: `Item not found: ${item.particulars}` });
        }
        if (inventoryItem.quantity < item.quantity) {
          return res.status(400).json({ 
            message: `Insufficient quantity for ${item.particulars}. Available: ${inventoryItem.quantity}` 
          });
        }
      }

      // Deduct from inventory
      for (const item of itemsToRelease) {
        const inventoryItem = await storage.getInventoryItemById(item.inventoryItemId);
        if (inventoryItem) {
          const newQuantity = inventoryItem.quantity - item.quantity;
          const newAmount = newQuantity * Number(inventoryItem.unitCost);
          
          await storage.updateInventoryItem(item.inventoryItemId, {
            quantity: newQuantity,
            amount: newAmount.toString(),
          });

          // Emit inventory change for real-time updates
          const updated = await storage.getInventoryItemById(item.inventoryItemId);
          emitInventoryChange('update', updated);
        }
      }

      // Generate SRO number
      const sroNo = `SRO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

      // Calculate total amount
      const totalAmount = itemsToRelease.reduce((sum, item) => sum + Number(item.amount), 0);

      // Create report
      const report = await storage.createReleasedOrderReport({
        sroNo,
        rsNo,
        departmentOffice,
        isPartial,
        items: itemsToRelease,
        totalAmount: totalAmount.toString(),
        releasedBy: userId,
        receivedBy: data.receivedBy,
      });

      res.status(201).json(report);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error('Generate report error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all Released Order Reports
  app.get("/api/released-orders/reports", requireAuth, async (req: Request, res: Response) => {
    try {
      const role = req.session.role;
      const userId = req.session.userId!;

      if (role === "admin") {
        const reports = await storage.getAllReleasedOrderReports();
        res.json(reports);
      } else {
        const reports = await storage.getReleasedOrderReportsByUser(userId);
        res.json(reports);
      }
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve Released Order Report template
  app.get("/api/released-orders/template", requireAuth, async (req: Request, res: Response) => {
    try {
      const templatePath = path.join(process.cwd(), 'attached_assets', 'EXCEL-RELEASED-ORDER-REPORT-GSO-IMS_1764403275954.xlsx');
      
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=released_order_template.xlsx');
      
      const fileStream = fs.createReadStream(templatePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Template serve error:', error);
      res.status(500).json({ message: "Failed to serve template" });
    }
  });

  // Notify admin about insufficient stock (Employee action)
  app.post("/api/released-orders/notify-insufficient", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { itemName, requestedQty, availableQty } = req.body;

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Notify all admins
      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin");
      
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: "alert",
          title: "Insufficient Stock Alert",
          message: `${user.name} requested ${requestedQty} of "${itemName}" but only ${availableQty} available.`,
          targetRoute: "/manage-inventory",
        });
        emitNotification(admin.id, { type: "insufficient_stock" });
      }

      res.json({ message: "Admin notified about insufficient stock" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============== END RELEASED ORDER ROUTES ==============

  // Dashboard Stats
  app.get("/api/stats/dashboard", requireAuth, async (req: Request, res: Response) => {
    try {
      const allItems = await storage.getAllInventoryItems();
      const allCategories = await storage.getAllCategories();
      const allUsers = await storage.getAllUsers();
      const pendingRequests = await storage.getPendingInventoryRequests();

      const totalItems = allItems.length;
      const totalQuantity = allItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalValue = allItems.reduce((sum, item) => sum + Number(item.amount), 0);

      res.json({
        totalItems,
        totalQuantity,
        totalValue,
        totalCategories: allCategories.length,
        totalUsers: allUsers.length,
        pendingRequests: pendingRequests.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Audit Events
  app.get("/api/audit", requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const { entityType, limit } = req.query;
      const events = await storage.getAuditEvents({
        entityType: entityType as "inventory" | "user" | "category" | "request" | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
