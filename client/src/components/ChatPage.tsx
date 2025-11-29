import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Users, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { chatApi, usersApi } from "@/lib/api";
import { getSocket } from "@/lib/socket";

interface ChatPageProps {
  userName: string;
  userId?: string;
}

export default function ChatPage({ userName, userId }: ChatPageProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['/api/users'],
    queryFn: usersApi.getAll,
  });

  const { data: messages = [], refetch } = useQuery({
    queryKey: ['/api/chat/messages', selectedUserId],
    queryFn: () => chatApi.getMessages(selectedUserId || undefined),
  });

  useEffect(() => {
    const socket = getSocket();
    
    const handleNewMessage = (newMessage: any) => {
      console.log('New chat message received:', newMessage);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/messages'] });
      refetch();
    };
    
    socket.on('chat:message', handleNewMessage);
    
    return () => {
      socket.off('chat:message', handleNewMessage);
    };
  }, [refetch]);

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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="p-6 md:p-8 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Chat</h1>
        <p className="text-muted-foreground mt-1">Real-time messaging with team members</p>
      </div>

      <Card className="flex-1 rounded-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-card-border flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <span className="font-semibold text-card-foreground">Conversation</span>
          </div>
          <div className="flex-1 w-full sm:w-auto">
            <Select value={selectedUserId || "all"} onValueChange={(value) => setSelectedUserId(value === "all" ? null : value)}>
              <SelectTrigger className="rounded-xl w-full sm:w-64" data-testid="select-chat-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users (Broadcast)</SelectItem>
                {users.filter((u: any) => u.id !== userId).map((user: any) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{selectedUserId ? `Chat with ${users.find((u: any) => u.id === selectedUserId)?.name}` : 'Broadcast to all users'}</span>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">No messages yet. Start a conversation!</p>
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
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(msg.sender?.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[60%] ${isOwnMessage ? 'order-first' : ''}`}>
                      <div
                        className={`rounded-2xl p-4 ${
                          isOwnMessage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card text-card-foreground border border-card-border'
                        }`}
                      >
                        {!isOwnMessage && (
                          <p className="text-xs font-semibold mb-1 opacity-70">{msg.sender?.name}</p>
                        )}
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 px-2">
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                    {isOwnMessage && (
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-sm">
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
          <div className="flex gap-3 max-w-4xl mx-auto">
            <Input
              placeholder="Type a message..."
              className="flex-1 rounded-xl h-12 bg-background text-foreground"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              data-testid="input-message"
            />
            <Button
              className="rounded-xl h-12 px-6"
              onClick={handleSendMessage}
              data-testid="button-send-message"
              disabled={sendMessageMutation.isPending || !message.trim()}
            >
              <Send className="w-5 h-5 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
