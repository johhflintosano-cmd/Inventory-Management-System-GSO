import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authApi } from "@/lib/api";

interface SignUpPageProps {
  onBack?: () => void;
  onSignUp?: (userData: any) => void;
}

export default function SignUpPage({ onBack, onSignUp }: SignUpPageProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'employee' as 'admin' | 'employee'
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      toast({
        title: "Registration Successful",
        description: data.message || "You are now logged in.",
      });
      if (onSignUp && data.user) {
        onSignUp(data.user);
      } else {
        onBack?.();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  // Password validation helper
  const validatePassword = (password: string): string | null => {
    const alphabeticCount = (password.match(/[a-zA-Z]/g) || []).length;
    const numericCount = (password.match(/[0-9]/g) || []).length;
    
    if (alphabeticCount < 7 || numericCount < 1) {
      return "Please enter at least more than 7 letters and enter at least a number (eg, HBisD657)";
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check password requirements
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      toast({
        title: "Password Requirements",
        description: passwordError,
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 rounded-2xl">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-card-foreground">Create Account</h1>
            <p className="text-sm text-muted-foreground">Join the DWCSJ Inventory Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-card-foreground">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  className="h-12 rounded-xl bg-background text-foreground"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="input-name"
                  required
                />
              </div>

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
                  placeholder="Create a password"
                  className="h-12 rounded-xl bg-background text-foreground"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  data-testid="input-password"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Password must have at least 7 letters and at least 1 number (e.g., HBisD657)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium text-card-foreground">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  className="h-12 rounded-xl bg-background text-foreground"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  data-testid="input-confirm-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-sm font-medium text-card-foreground">Account Type</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: 'admin' | 'employee') => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl bg-background text-foreground" data-testid="select-role">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-base"
              data-testid="button-signup"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "Creating Account..." : "Create Account"}
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
