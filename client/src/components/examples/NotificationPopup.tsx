import NotificationPopup, { NotificationBell } from '../NotificationPopup';

//todo: remove mock functionality
const mockNotifications = [
  {
    id: 1,
    type: 'success' as const,
    title: 'Request Approved',
    message: 'Your edit request for Dell Monitor has been approved.'
  },
  {
    id: 2,
    type: 'alert' as const,
    title: 'Low Stock Alert',
    message: 'HP EliteBook stock is running low (4 remaining).'
  }
];

export default function NotificationPopupExample() {
  return (
    <div className="relative h-screen">
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-xl font-semibold">Notification System</h2>
          <NotificationBell count={3} />
        </div>
        <p className="text-muted-foreground">Notifications appear in the top-right corner and auto-dismiss after 5 seconds.</p>
      </div>
      <NotificationPopup notifications={mockNotifications} />
    </div>
  );
}
