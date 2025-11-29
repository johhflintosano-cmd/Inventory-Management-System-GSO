import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageCircle, X, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { chatApi, usersApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface ChatWidgetProps {
  userName: string;
  userId?: string;
  isOpen?: boolean;
}

export default function ChatWidget({ userName, userId, isOpen: initialOpen = false }: ChatWidgetProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [message, setMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all users for chat selection
  const { data: users = [] } = useQuery({
    queryKey: ['/api/users'],
    queryFn: usersApi.getAll,
    enabled: isOpen,
  });

  // Fetch messages
  const { data: messages = [], refetch } = useQuery({
    queryKey: ['/api/chat/messages', selectedUserId],
    queryFn: () => chatApi.getMessages(selectedUserId || undefined),
    enabled: isOpen,
  });

  // Real-time Socket.IO for instant messages (like Messenger)
  useEffect(() => {
    const socket = getSocket();
    
    const handleNewMessage = (newMessage: any) => {
      console.log('New chat message received:', newMessage);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/messages'] });
      refetch();
      
      // Show notification if chat is closed and message is from someone else
      if (!isOpen && newMessage.senderId !== userId) {
        setUnreadCount(prev => prev + 1);
        toast({
          title: "New Message",
          description: `${newMessage.sender?.name || 'Someone'}: ${newMessage.message.slice(0, 50)}${newMessage.message.length > 50 ? '...' : ''}`,
        });
      }
    };
    
    socket.on('chat:message', handleNewMessage);
    
    return () => {
      socket.off('chat:message', handleNewMessage);
    };
  }, [isOpen, userId, refetch, toast]);

  // Clear unread count when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: chatApi.sendMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/messages'] });
      setMessage("");
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (message.trim()) {
      sendMessageMutation.mutate({
        receiverId: selectedUserId,
        message: message.trim(),
      });
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg z-50"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-chat-toggle"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {unreadCount > 0 && !isOpen && (
          <Badge className="absolute -top-1 -right-1 w-6 h-6 p-0 flex items-center justify-center rounded-full bg-accent text-accent-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-96 h-[500px] rounded-2xl shadow-xl z-50 flex flex-col">
          <div className="p-4 border-b border-card-border space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-card-foreground">Chat</h3>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
              <SelectTrigger className="rounded-xl" data-testid="select-chat-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users (Broadcast)</SelectItem>
                {users.map((user: any) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {selectedUserId ? `Chat with ${users.find((u: any) => u.id === selectedUserId)?.name}` : 'Broadcast to all users'}
            </p>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No messages yet. Start a conversation!</p>
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isOwnMessage = msg.sender?.name === userName;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      data-testid={`message-${msg.id}`}
                    >
                      {!isOwnMessage && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {getInitials(msg.sender?.name || 'U')}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className={`max-w-[70%] ${isOwnMessage ? 'order-first' : ''}`}>
                        <div
                          className={`rounded-2xl p-3 ${
                            isOwnMessage
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-card text-card-foreground border border-card-border'
                          }`}
                        >
                          {!isOwnMessage && (
                            <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender?.name}</p>
                          )}
                          <p className="text-sm">{msg.message}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 px-2">
                          {formatTime(msg.createdAt)}
                        </p>
                      </div>
                      {isOwnMessage && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                            {getInitials(userName)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-card-border">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                className="flex-1 rounded-xl bg-background text-foreground"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                data-testid="input-message"
              />
              <Button
                size="icon"
                className="rounded-xl"
                onClick={handleSendMessage}
                data-testid="button-send-message"
                disabled={sendMessageMutation.isPending || !message.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
