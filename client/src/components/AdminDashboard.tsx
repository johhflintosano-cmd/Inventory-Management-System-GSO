import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, CheckCircle2, Users, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { queryClient } from "@/lib/queryClient";
import { getSocket } from "@/lib/socket";

interface DashboardStats {
  totalItems: number;
  lowStockCount: number;
  pendingRequestsCount: number;
  activeUsersCount: number;
}

interface CategoryData {
  category: string;
  count: number;
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats/dashboard'],
  });

  const { data: categories } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/categories'],
  });

  const { data: inventory } = useQuery<any[]>({
    queryKey: ['/api/inventory'],
  });

  // Real-time updates for dashboard stats
  useEffect(() => {
    const socket = getSocket();
    
    const handleInventoryChange = () => {
      console.log('Dashboard: Inventory changed, refreshing stats...');
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
    };

    const handleUserChange = () => {
      console.log('Dashboard: User changed, refreshing stats...');
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    };

    const handleRequestChange = () => {
      console.log('Dashboard: Request changed, refreshing stats...');
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
    };
    
    socket.on('inventory_change', handleInventoryChange);
    socket.on('user_change', handleUserChange);
    socket.on('request_change', handleRequestChange);
    
    return () => {
      socket.off('inventory_change', handleInventoryChange);
      socket.off('user_change', handleUserChange);
      socket.off('request_change', handleRequestChange);
    };
  }, []);

  const chartData: CategoryData[] = categories?.map(cat => ({
    category: cat.name,
    count: inventory?.filter(item => item.categoryId === cat.id).reduce((sum, item) => sum + item.quantity, 0) || 0
  })) || [];

  const displayStats = {
    totalItems: stats?.totalItems ?? 0,
    lowStock: stats?.lowStockCount ?? 0,
    pendingRequests: stats?.pendingRequestsCount ?? 0,
    activeUsers: stats?.activeUsersCount ?? 0
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back, Admin. Here's your inventory overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <Package className="w-8 h-8 text-primary" />
            <Badge className="rounded-full">Total</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-total-items">
              {statsLoading ? "..." : displayStats.totalItems}
            </p>
            <p className="text-sm text-muted-foreground">Total Items</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <AlertTriangle className="w-8 h-8 text-accent" />
            <Badge variant="secondary" className="rounded-full bg-accent/10 text-accent-foreground">Alert</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-low-stock">
              {statsLoading ? "..." : displayStats.lowStock}
            </p>
            <p className="text-sm text-muted-foreground">Low Stock Items</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <Badge variant="secondary" className="rounded-full bg-accent/10 text-accent-foreground">Pending</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-pending-requests">
              {statsLoading ? "..." : displayStats.pendingRequests}
            </p>
            <p className="text-sm text-muted-foreground">Pending Requests</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8 text-primary" />
            <Badge className="rounded-full">Active</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-active-users">
              {statsLoading ? "..." : displayStats.activeUsers}
            </p>
            <p className="text-sm text-muted-foreground">Active Users</p>
          </div>
        </Card>
      </div>

      <Card className="p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-card-foreground">Inventory by Category</h2>
            <p className="text-sm text-muted-foreground mt-1">Current stock levels across categories</p>
          </div>
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.75rem',
                  color: 'hsl(var(--card-foreground))'
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No categories or inventory items yet. Add some to see the chart.
          </div>
        )}
      </Card>
    </div>
  );
}
