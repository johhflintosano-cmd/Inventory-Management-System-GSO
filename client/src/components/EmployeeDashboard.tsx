import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";
import { getSocket } from "@/lib/socket";

interface EmployeeStats {
  assignedItems: number;
  pendingRequests: number;
  approvedRequests: number;
  deniedRequests: number;
}

export default function EmployeeDashboard() {
  const { data: stats, isLoading } = useQuery<EmployeeStats>({
    queryKey: ['/api/stats/dashboard'],
  });

  // Real-time updates for dashboard stats
  useEffect(() => {
    const socket = getSocket();
    
    const handleInventoryChange = () => {
      console.log('Employee Dashboard: Inventory changed, refreshing stats...');
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    };

    const handleUserChange = () => {
      console.log('Employee Dashboard: User changed, refreshing stats...');
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dashboard'] });
    };

    const handleRequestChange = () => {
      console.log('Employee Dashboard: Request changed, refreshing stats...');
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

  const displayStats = {
    assignedItems: stats?.assignedItems ?? 0,
    pendingRequests: stats?.pendingRequests ?? 0,
    approvedRequests: stats?.approvedRequests ?? 0,
    deniedRequests: stats?.deniedRequests ?? 0
  };

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back! Here's your inventory overview.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <Package className="w-8 h-8 text-primary" />
            <Badge className="rounded-full">Assigned</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-assigned-items">
              {isLoading ? "..." : displayStats.assignedItems}
            </p>
            <p className="text-sm text-muted-foreground">Assigned Items</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-accent" />
            <Badge variant="secondary" className="rounded-full bg-accent/10 text-accent-foreground">Pending</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-pending-requests">
              {isLoading ? "..." : displayStats.pendingRequests}
            </p>
            <p className="text-sm text-muted-foreground">Pending Requests</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <Badge className="rounded-full">Approved</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-approved-requests">
              {isLoading ? "..." : displayStats.approvedRequests}
            </p>
            <p className="text-sm text-muted-foreground">Approved</p>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <XCircle className="w-8 h-8 text-destructive" />
            <Badge variant="secondary" className="rounded-full bg-destructive/10 text-destructive-foreground">Denied</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-card-foreground" data-testid="stat-denied-requests">
              {isLoading ? "..." : displayStats.deniedRequests}
            </p>
            <p className="text-sm text-muted-foreground">Denied</p>
          </div>
        </Card>
      </div>

      <Card className="p-6 rounded-2xl">
        <h2 className="text-xl font-semibold text-card-foreground mb-4">Quick Actions</h2>
        <p className="text-muted-foreground">
          Use the sidebar to navigate to Manage Inventory to view your assigned items or Process Requests to check your request status.
        </p>
      </Card>
    </div>
  );
}
