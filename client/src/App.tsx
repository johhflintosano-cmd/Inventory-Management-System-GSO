import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { authApi } from "@/lib/api";

import LoadingPage from "@/components/LoadingPage";
import WelcomePage from "@/components/WelcomePage";
import SignUpPage from "@/components/SignUpPage";
import LoginPage from "@/components/LoginPage";
import AdminDashboard from "@/components/AdminDashboard";
import EmployeeDashboard from "@/components/EmployeeDashboard";
import ManageInventory from "@/components/ManageInventory";
import ProcessRequests from "@/components/ProcessRequests";
import GenerateReports from "@/components/GenerateReports";
import UserManagement from "@/components/UserManagement";
import AuditHistory from "@/components/AuditHistory";
import AppSidebar from "@/components/AppSidebar";
import ChatPage from "@/components/ChatPage";
import ReleasedOrders from "@/components/ReleasedOrders";
import ProcessReleasedOrders from "@/components/ProcessReleasedOrders";
import { NotificationBell } from "@/components/NotificationPopup";

type Page = 'loading' | 'welcome' | 'signup' | 'login' | 'app';
type AppRoute = '/dashboard' | '/inventory' | '/requests' | '/released-orders' | '/process-released-orders' | '/reports' | '/users' | '/audit-history' | '/chat';

function Router() {
  const [currentPage, setCurrentPage] = useState<Page>('loading');
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('/dashboard');
  const [user, setUser] = useState<any>(null);

  // Check for existing session on mount
  const { data: sessionUser, isLoading: isCheckingSession } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: authApi.getMe,
    retry: false,
    enabled: currentPage === 'loading',
  });

  useEffect(() => {
    if (!isCheckingSession) {
      if (sessionUser) {
        setUser(sessionUser);
        setCurrentPage('app');
      } else {
        const timer = setTimeout(() => {
          setCurrentPage('welcome');
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionUser, isCheckingSession]);

  const handleNavigateFromWelcome = (page: 'login' | 'signup') => {
    setCurrentPage(page);
  };

  const handleBackToWelcome = () => {
    setCurrentPage('welcome');
  };

  const handleSignUpComplete = (userData: any) => {
    setUser(userData);
    setCurrentPage('app');
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
  };

  const handleLoginComplete = (userData: any) => {
    setUser(userData);
    setCurrentPage('app');
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      setCurrentPage('login');
      setCurrentRoute('/dashboard');
      queryClient.clear();
      console.log('Logout successful - redirected to login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if logout API fails, still clear session locally
      setUser(null);
      setCurrentPage('login');
      setCurrentRoute('/dashboard');
      queryClient.clear();
    }
  };

  const handleNavigate = (path: string) => {
    setCurrentRoute(path as AppRoute);
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
  };

  if (currentPage === 'loading') {
    return <LoadingPage />;
  }

  if (currentPage === 'welcome') {
    return <WelcomePage onNavigate={handleNavigateFromWelcome} />;
  }

  if (currentPage === 'signup') {
    return <SignUpPage onBack={handleBackToWelcome} onSignUp={handleSignUpComplete} />;
  }

  if (currentPage === 'login') {
    return <LoginPage onBack={handleBackToWelcome} onLogin={handleLoginComplete} />;
  }

  if (currentPage === 'app' && user) {
    const isAdmin = user.role === 'admin';
    
    return (
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar
            isAdmin={isAdmin}
            currentPath={currentRoute}
            userName={user.name}
            userRole={isAdmin ? 'Administrator' : 'Employee'}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="border-b border-border bg-background">
              <div className="flex items-center justify-between px-6 py-3">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <NotificationBell onNavigate={handleNavigate} />
              </div>
            </header>
            <main className="flex-1 overflow-auto bg-background">
              {currentRoute === '/dashboard' && (
                isAdmin ? <AdminDashboard /> : <EmployeeDashboard />
              )}
              {currentRoute === '/inventory' && (
                <ManageInventory user={user} />
              )}
              {currentRoute === '/requests' && (
                <ProcessRequests user={user} />
              )}
              {currentRoute === '/chat' && (
                <ChatPage userName={user.name} userId={user.id} />
              )}
              {currentRoute === '/released-orders' && (
                <ReleasedOrders user={user} />
              )}
              {currentRoute === '/process-released-orders' && isAdmin && (
                <ProcessReleasedOrders />
              )}
              {currentRoute === '/reports' && (
                <GenerateReports isAdmin={isAdmin} />
              )}
              {currentRoute === '/users' && isAdmin && (
                <UserManagement />
              )}
              {currentRoute === '/audit-history' && isAdmin && (
                <AuditHistory />
              )}
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return <LoadingPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
