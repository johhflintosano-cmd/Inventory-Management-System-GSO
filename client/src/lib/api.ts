import { apiRequest } from "./queryClient";

// Types for the new inventory system
export interface ItemPayload {
  supplier: string;
  quantity: number;
  unitOfMeasure: string;
  itemName: string;
  location: string;
  unitCost: number;
  amount: number;
  remarks?: string;
  categoryName?: string;
}

export interface ItemDecision {
  index: number;
  status: "approved" | "denied";
  reason?: string;
}

// Auth API
export const authApi = {
  register: async (data: { name: string; email: string; password: string; role?: string }) => {
    const res = await apiRequest('POST', '/api/auth/register', data);
    return res.json();
  },
  
  login: async (data: { email: string; password: string }) => {
    const res = await apiRequest('POST', '/api/auth/login', data);
    return res.json();
  },
  
  logout: async () => {
    const res = await apiRequest('POST', '/api/auth/logout');
    return res.json();
  },
  
  getMe: async () => {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error('Not authenticated');
    return res.json();
  },
};

// Inventory API - Updated for new schema
export const inventoryApi = {
  getAll: async () => {
    const res = await fetch('/api/inventory', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch inventory');
    return res.json();
  },
  
  getById: async (id: string) => {
    const res = await fetch(`/api/inventory/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch item');
    return res.json();
  },
  
  create: async (data: ItemPayload) => {
    const res = await apiRequest('POST', '/api/inventory', data);
    return res.json();
  },
  
  createBulk: async (items: ItemPayload[]) => {
    const res = await apiRequest('POST', '/api/inventory/bulk', { items });
    return res.json();
  },
  
  update: async (id: string, data: Partial<ItemPayload>) => {
    const res = await apiRequest('PATCH', `/api/inventory/${id}`, data);
    return res.json();
  },
  
  delete: async (id: string) => {
    const res = await apiRequest('DELETE', `/api/inventory/${id}`);
    return res.json();
  },
};

// Categories API
export const categoriesApi = {
  getAll: async () => {
    const res = await fetch('/api/categories', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },
  
  create: async (data: { name: string }) => {
    const res = await apiRequest('POST', '/api/categories', data);
    return res.json();
  },
  
  getHistory: async (id: string) => {
    const res = await fetch(`/api/categories/${id}/history`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch category history');
    return res.json();
  },
};

// Inventory Requests API - For employee submissions
export const requestsApi = {
  getAll: async () => {
    const res = await fetch('/api/requests', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch requests');
    return res.json();
  },
  
  createSingle: async (data: ItemPayload) => {
    const res = await apiRequest('POST', '/api/requests/single', data);
    return res.json();
  },
  
  createBulk: async (items: ItemPayload[], supplier?: string) => {
    const res = await apiRequest('POST', '/api/requests/bulk', { items, supplier });
    return res.json();
  },
  
  // Admin review - supports both simple approve/deny and per-item decisions
  review: async (id: string, status: 'approved' | 'denied' | 'partial', itemDecisions?: ItemDecision[]) => {
    const res = await apiRequest('PATCH', `/api/requests/${id}`, { status, itemDecisions });
    return res.json();
  },
};

// Notifications API
export const notificationsApi = {
  getAll: async () => {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return res.json();
  },
  
  getUnreadCount: async () => {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch unread count');
    return res.json();
  },
  
  markAsRead: async (id: string) => {
    const res = await apiRequest('PATCH', `/api/notifications/${id}/read`);
    return res.json();
  },
  
  markAllAsRead: async () => {
    const res = await apiRequest('PATCH', '/api/notifications/read-all');
    return res.json();
  },
};

// Chat API
export const chatApi = {
  getMessages: async (otherUserId?: string) => {
    const url = otherUserId ? `/api/chat?with=${otherUserId}` : '/api/chat';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },
  
  sendMessage: async (data: { receiverId: string | null; message: string }) => {
    const res = await apiRequest('POST', '/api/chat', data);
    return res.json();
  },
};

// Users API
export const usersApi = {
  getAll: async () => {
    const res = await fetch('/api/users', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },
  
  updateRole: async (id: string, role: 'admin' | 'employee') => {
    const res = await apiRequest('PATCH', `/api/users/${id}/role`, { role });
    return res.json();
  },
  
  delete: async (id: string) => {
    const res = await apiRequest('DELETE', `/api/users/${id}`);
    return res.json();
  },
};

// Reports API
export const reportsApi = {
  getAll: async () => {
    const res = await fetch('/api/reports', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch reports');
    return res.json();
  },
  
  create: async (data: { name: string; type: string; dateRange: string; data: any; accessGrantedTo?: string[] }) => {
    const res = await apiRequest('POST', '/api/reports', data);
    return res.json();
  },
  
  createReceivingReport: async (itemIds: string[], dateRange?: string) => {
    const res = await apiRequest('POST', '/api/reports/receiving', { itemIds, dateRange });
    return res.json();
  },
};

// Stats API
export const statsApi = {
  getDashboard: async () => {
    const res = await fetch('/api/stats/dashboard', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    return res.json();
  },
};

// Audit Events API
export const auditEventsApi = {
  getAll: async (entityType?: 'inventory' | 'user' | 'category' | 'request', limit?: number) => {
    const params = new URLSearchParams();
    if (entityType) params.append('entityType', entityType);
    if (limit) params.append('limit', limit.toString());
    
    const url = `/api/audit${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch audit events');
    return res.json();
  },
};
