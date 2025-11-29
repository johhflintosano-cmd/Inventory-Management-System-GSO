import { Home, Package, FileText, ClipboardList, UserCog, LogOut, History, MessageCircle, ClipboardCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface AppSidebarProps {
  isAdmin?: boolean;
  currentPath?: string;
  userName?: string;
  userRole?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

export default function AppSidebar({
  isAdmin = true,
  currentPath = "/dashboard",
  userName = "Admin User",
  userRole = "Administrator",
  onNavigate,
  onLogout
}: AppSidebarProps) {
  const menuItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
    },
    {
      title: "Manage Inventory",
      url: "/inventory",
      icon: Package,
    },
    {
      title: "Process Requests",
      url: "/requests",
      icon: ClipboardList,
    },
    ...(isAdmin ? [{
      title: "Review Released Orders",
      url: "/process-released-orders",
      icon: ClipboardCheck,
    }] : []),
    {
      title: "Chat",
      url: "/chat",
      icon: MessageCircle,
      isChat: true, // Special styling for chat
    },
    ...(isAdmin ? [{
      title: "Generate Reports",
      url: "/reports",
      icon: FileText,
    }] : []),
    ...(isAdmin ? [{
      title: "User Management",
      url: "/users",
      icon: UserCog,
    }] : []),
    ...(isAdmin ? [{
      title: "Change History",
      url: "/audit-history",
      icon: History,
    }] : []),
  ];

  const handleNavigation = (url: string) => {
    onNavigate?.(url);
    console.log('Navigate to:', url);
  };

  const handleLogout = () => {
    onLogout?.();
    console.log('Logout triggered');
  };

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-6 py-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-sidebar-foreground">DWCSJ</h2>
            <p className="text-xs text-muted-foreground">Inventory Management</p>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item: any) => {
                const isActive = currentPath === item.url;
                const isChatItem = item.isChat;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.url.slice(1)}`}
                      className={isChatItem && isActive ? "bg-primary text-white hover:bg-primary/90 hover:text-white" : ""}
                    >
                      <div className={`cursor-pointer ${isChatItem && isActive ? "text-white" : ""}`}>
                        {item.icon && <item.icon className={`w-4 h-4 ${isChatItem && isActive ? "text-white" : ""}`} />}
                        <span className={`${isChatItem && isActive ? "text-white font-semibold" : ""} ${item.noIcon ? "font-semibold" : ""}`}>{item.title}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-3 py-3 flex items-center gap-3 border-t border-sidebar-border">
              <Avatar className="w-9 h-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {userName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userRole}</p>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
