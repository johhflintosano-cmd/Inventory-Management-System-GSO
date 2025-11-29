import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, UserCog, Shield, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { usersApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export default function UserManagement() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch users from API
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['/api/users'],
    queryFn: usersApi.getAll,
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'employee' }) => 
      usersApi.updateRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey.includes('/api/users')
      });
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey.includes('/api/users')
      });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  // Socket.IO listener for real-time user updates
  useEffect(() => {
    const socket = getSocket();
    
    const handleUserChange = (data: { type: string; user?: any; userId?: string }) => {
      console.log('User change event:', data);
      // Invalidate all user queries using predicate
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey.includes('/api/users')
      });
      
      if (data.type === 'update' && data.user) {
        toast({
          title: "User Updated",
          description: `${data.user.name}'s information was updated`,
        });
      } else if (data.type === 'delete') {
        toast({
          title: "User Removed",
          description: `User was removed from the system`,
        });
      }
    };
    
    socket.on('user_change', handleUserChange);
    
    return () => {
      socket.off('user_change', handleUserChange);
    };
  }, [toast]);

  const handlePromoteToAdmin = (userId: string) => {
    updateRoleMutation.mutate({ id: userId, role: 'admin' });
  };

  const handleDemoteToEmployee = (userId: string) => {
    updateRoleMutation.mutate({ id: userId, role: 'employee' });
  };

  const handleDeleteUser = (userId: string) => {
    deleteUserMutation.mutate(userId);
  };

  const filteredUsers = users.filter((user: any) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage user roles and permissions across the system
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="rounded-full">
            {users.filter((u: any) => u.role === 'admin').length} Admins
          </Badge>
          <Badge variant="secondary" className="rounded-full">
            {users.filter((u: any) => u.role === 'employee').length} Employees
          </Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder="Search users by name or email..."
          className="pl-10 h-12 rounded-xl bg-background text-foreground"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-users"
        />
      </div>

      {filteredUsers.length === 0 ? (
        <Card className="p-12 rounded-2xl text-center">
          <p className="text-muted-foreground">
            {searchQuery ? "No users found matching your search" : "No users in the system yet"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredUsers.map((user: any) => (
            <Card key={user.id} className="p-6 rounded-2xl" data-testid={`card-user-${user.id}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex items-center gap-4 flex-1">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className={user.role === 'admin' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}>
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-lg text-card-foreground truncate">
                        {user.name}
                      </h3>
                      {user.role === 'admin' ? (
                        <Badge className="rounded-full gap-1">
                          <Shield className="w-3 h-3" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-full gap-1">
                          <User className="w-3 h-3" />
                          Employee
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {user.role === 'employee' ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="default"
                          className="rounded-xl gap-2"
                          data-testid={`button-promote-${user.id}`}
                          disabled={updateRoleMutation.isPending}
                        >
                          <UserCog className="w-4 h-4" />
                          Promote to Admin
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Promote to Administrator</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to promote {user.name} to Administrator? 
                            They will have full access to all system features including user management, 
                            inventory control, and report generation.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl"
                            onClick={() => handlePromoteToAdmin(user.id)}
                          >
                            Promote to Admin
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="rounded-xl gap-2"
                          data-testid={`button-demote-${user.id}`}
                          disabled={updateRoleMutation.isPending}
                        >
                          <User className="w-4 h-4" />
                          Demote to Employee
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Demote to Employee</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to demote {user.name} to Employee? 
                            They will lose access to admin features like user management and report generation.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-xl"
                            onClick={() => handleDemoteToEmployee(user.id)}
                          >
                            Demote to Employee
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-xl text-destructive"
                        data-testid={`button-delete-${user.id}`}
                        disabled={deleteUserMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete {user.name}? This action cannot be undone. 
                          All their data and request history will be permanently removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-xl bg-destructive hover:bg-destructive/90"
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          Delete User
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
