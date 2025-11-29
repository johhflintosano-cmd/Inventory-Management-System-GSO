import { io, Socket } from "socket.io-client";

// Create a singleton Socket.IO client instance
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      withCredentials: true,
      transports: ['websocket'],
      path: '/socket.io'
    });
    
    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket?.id);
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
    });
  }
  
  return socket;
}

// Clean up function (not typically needed in browser apps, but good practice)
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
