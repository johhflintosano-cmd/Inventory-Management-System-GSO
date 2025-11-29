import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, User, Package, Shield, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient } from "@/lib/queryClient";
import { auditEventsApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export default function AuditHistory() {
  const [filterType, setFilterType] = useState<"all" | "inventory" | "user">("all");

  // Fetch audit events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['/api/audit-events', filterType === "all" ? undefined : filterType],
    queryFn: () => auditEventsApi.getAll(filterType === "all" ? undefined : filterType, 50),
  });

  // Socket.IO listener for real-time audit event updates
  useEffect(() => {
    const socket = getSocket();
    
    const handleAuditUpdate = (data: { type: string; item?: any; itemId?: string } | { type: string; user?: any; userId?: string }) => {
      console.log('Audit event triggered:', data);
      // Invalidate all audit event queries regardless of filter using predicate
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey.includes('/api/audit-events')
      });
    };
    
    socket.on('inventory_change', handleAuditUpdate);
    socket.on('user_change', handleAuditUpdate);
    
    return () => {
      socket.off('inventory_change', handleAuditUpdate);
      socket.off('user_change', handleAuditUpdate);
    };
  }, []);

  const getActionIcon = (entityType: string) => {
    return entityType === 'inventory' ? <Package className="w-4 h-4" /> : <User className="w-4 h-4" />;
  };

  const getActionBadge = (action: string) => {
    const variants: Record<string, { text: string; variant: "default" | "secondary" | "destructive" }> = {
      create: { text: "Created", variant: "default" },
      update: { text: "Updated", variant: "secondary" },
      delete: { text: "Deleted", variant: "destructive" },
      role_change: { text: "Role Changed", variant: "secondary" },
    };
    
    const config = variants[action] || { text: action, variant: "default" };
    return <Badge variant={config.variant} className="rounded-full">{config.text}</Badge>;
  };

  const formatChangeSummary = (event: any) => {
    const actor = event.actorSnapshot as { name: string; email: string } | null;
    const actorName = actor?.name || 'System';
    const before = event.before as any;
    const after = event.after as any;
    
    if (event.action === 'create') {
      return (
        <div>
          <span className="font-semibold">{actorName}</span> created{' '}
          {event.entityType === 'inventory' ? (
            <>item <span className="font-semibold">{after?.name}</span> (Qty: {after?.quantity})</>
          ) : (
            <>user <span className="font-semibold">{after?.name}</span></>
          )}
        </div>
      );
    } else if (event.action === 'update') {
      return (
        <div>
          <span className="font-semibold">{actorName}</span> updated{' '}
          <span className="font-semibold">{after?.name || before?.name}</span>
          {before?.quantity !== after?.quantity && (
            <span className="text-muted-foreground ml-2">
              (Qty: {before?.quantity} → {after?.quantity})
            </span>
          )}
        </div>
      );
    } else if (event.action === 'delete') {
      return (
        <div>
          <span className="font-semibold">{actorName}</span> deleted{' '}
          {event.entityType === 'inventory' ? (
            <>item <span className="font-semibold">{before?.name}</span></>
          ) : (
            <>user <span className="font-semibold">{before?.name}</span></>
          )}
        </div>
      );
    } else if (event.action === 'role_change') {
      return (
        <div>
          <span className="font-semibold">{actorName}</span> changed{' '}
          <span className="font-semibold">{after?.name}</span>'s role from{' '}
          <Badge variant="secondary" className="mx-1">{before?.role}</Badge> to{' '}
          <Badge variant="default" className="mx-1">{after?.role}</Badge>
        </div>
      );
    }
    
    return <span>{actorName} performed {event.action}</span>;
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading audit history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Change History</h1>
          <p className="text-muted-foreground mt-1">
            Track all inventory and user changes across the system
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
            <SelectTrigger className="w-48 rounded-xl" data-testid="select-filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Changes</SelectItem>
              <SelectItem value="inventory">Inventory Only</SelectItem>
              <SelectItem value="user">Users Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {events.length === 0 ? (
        <Card className="p-12 rounded-2xl text-center">
          <p className="text-muted-foreground">
            {filterType === "all" 
              ? "No changes recorded yet. Changes will appear here when items or users are modified." 
              : `No ${filterType} changes recorded yet.`}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event: any) => (
            <Card key={event.id} className="p-6 rounded-2xl" data-testid={`card-audit-${event.id}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  {getActionIcon(event.entityType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    {getActionBadge(event.action)}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(event.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm text-card-foreground">
                    {formatChangeSummary(event)}
                  </div>
                  {event.actorSnapshot && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Shield className="w-3 h-3" />
                      {(event.actorSnapshot as any).email}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
