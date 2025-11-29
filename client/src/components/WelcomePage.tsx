import { useState } from "react";
import { Menu, X, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import dwcsjSeal from "@assets/DWCSJ_Seal_1764053138127.png";

interface WelcomePageProps {
  onNavigate?: (page: 'login' | 'signup') => void;
}

export default function WelcomePage({ onNavigate }: WelcomePageProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavigation = (page: 'login' | 'signup') => {
    setIsMenuOpen(false);
    onNavigate?.(page);
    console.log(`Navigate to ${page}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-menu-toggle">
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <div className="flex flex-col gap-4 mt-8">
                <Button 
                  variant="default" 
                  className="w-full justify-start gap-3 h-12 rounded-xl" 
                  onClick={() => handleNavigation('login')}
                  data-testid="button-menu-login"
                >
                  <LogIn className="w-5 h-5" />
                  Log In
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3 h-12 rounded-xl" 
                  onClick={() => handleNavigation('signup')}
                  data-testid="button-menu-signup"
                >
                  <UserPlus className="w-5 h-5" />
                  Sign Up
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="text-sm font-medium text-foreground">DWCSJ IMS</div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-4">
            <img src={dwcsjSeal} alt="DWCSJ Seal" className="w-40 h-40 mx-auto" />
            <h1 className="text-5xl md:text-6xl font-bold text-foreground">
              DWCSJ
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground">
              Divine Word College of San Jose
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground mt-6">
              Inventory Management System
            </h2>
          </div>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Streamline your inventory operations with role-based access, real-time notifications, 
            and comprehensive reporting tools designed for efficiency and clarity.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-12">
            <Button 
              size="lg" 
              className="w-full sm:w-auto h-12 px-8 rounded-xl text-base"
              onClick={() => handleNavigation('login')}
              data-testid="button-login"
            >
              <LogIn className="w-5 h-5 mr-2" />
              Log In
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="w-full sm:w-auto h-12 px-8 rounded-xl text-base"
              onClick={() => handleNavigation('signup')}
              data-testid="button-signup"
            >
              <UserPlus className="w-5 h-5 mr-2" />
              Sign Up
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
