import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/lib/api";

interface LoginPageProps {
  onBack?: () => void;
  onLogin?: (user: any) => void;
}

export default function LoginPage({ onBack, onLogin }: LoginPageProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
      onLogin?.(data.user);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({
      email: formData.email,
      password: formData.password,
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 rounded-2xl">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-card-foreground">Welcome Back</h1>
            <p className="text-sm text-muted-foreground">
              Log in to access the inventory system
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-card-foreground">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  className="h-12 rounded-xl bg-background text-foreground"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-card-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="h-12 rounded-xl bg-background text-foreground"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  data-testid="input-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base"
              data-testid="button-login"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Logging in..." : "Log In"}
            </Button>
          </form>

          <div className="text-center">
            <Button
              variant="ghost"
              onClick={onBack}
              className="text-sm text-muted-foreground hover:text-foreground"
              data-testid="button-back"
            >
              ← Back to Welcome
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
