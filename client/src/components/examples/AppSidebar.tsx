import AppSidebar from '../AppSidebar';
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppSidebarExample() {
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-xl font-semibold mb-4">Admin Sidebar</h2>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-[600px] w-full border border-border rounded-2xl overflow-hidden">
            <AppSidebar isAdmin={true} userName="Admin User" userRole="Administrator" />
            <div className="flex-1 p-8">
              <p className="text-muted-foreground">Main content area</p>
            </div>
          </div>
        </SidebarProvider>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-4">Employee Sidebar</h2>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-[600px] w-full border border-border rounded-2xl overflow-hidden">
            <AppSidebar isAdmin={false} userName="Juan Dela Cruz" userRole="Employee" />
            <div className="flex-1 p-8">
              <p className="text-muted-foreground">Main content area</p>
            </div>
          </div>
        </SidebarProvider>
      </div>
    </div>
  );
}
