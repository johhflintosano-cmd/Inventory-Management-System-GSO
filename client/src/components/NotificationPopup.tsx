import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, CheckCircle2, AlertCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notificationsApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { getSocket } from "@/lib/socket";

interface Notification {
  id: string;
  type: 'success' | 'alert' | 'info';
  title: string;
  message: string;
  targetRoute?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  onNavigate?: (path: string) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch notifications
  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['/api/notifications'],
    queryFn: notificationsApi.getAll,
  });

  // Fetch unread count
  const { data: unreadData, refetch: refetchCount } = useQuery({
    queryKey: ['/api/notifications/unread-count'],
    queryFn: notificationsApi.getUnreadCount,
  });

  const unreadCount = unreadData?.count || 0;

  // Real-time notification updates
  useEffect(() => {
    const socket = getSocket();
    
    const handleNewNotification = (notification: Notification) => {
      console.log('New notification received:', notification);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      refetch();
      refetchCount();
    };
    
    socket.on('notification', handleNewNotification);
    
    return () => {
      socket.off('notification', handleNewNotification);
    };
  }, [refetch, refetchCount]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      <Button 
        size="icon" 
        variant="ghost" 
        className="relative rounded-xl" 
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent text-accent-foreground text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute top-12 right-0 w-80 max-h-96 rounded-2xl shadow-xl z-50 flex flex-col">
          <div className="p-4 border-b border-card-border flex items-center justify-between">
            <h3 className="font-semibold text-card-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-xs"
                onClick={() => markAllAsReadMutation.mutate()}
                data-testid="button-mark-all-read"
              >
                Mark all read
              </Button>
            )}
          </div>
          
          <ScrollArea className="flex-1 max-h-72">
            {notifications.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {notifications.map((notification: Notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                      !notification.isRead ? 'bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      if (!notification.isRead) {
                        markAsReadMutation.mutate(notification.id);
                      }
                      // Navigate to target route if available
                      if (notification.targetRoute && onNavigate) {
                        onNavigate(notification.targetRoute);
                        setIsOpen(false);
                      }
                    }}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {notification.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-accent" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground">
                          {notification.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

export default function NotificationPopup() {
  return null;
}
