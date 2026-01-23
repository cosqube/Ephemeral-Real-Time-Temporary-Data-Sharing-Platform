const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const CONFIG = {
  MAX_PASTE_SIZE: 20 * 1024, // 20 KB
  MAX_USERS_PER_ROOM: 20,
  RATE_LIMIT_WINDOW: 1000, // 1 second
  RATE_LIMIT_MAX: 5, // max 5 pastes per second
  GRACE_PERIOD: 10000, // 10 seconds before room deletion
  PORT: process.env.PORT || 3000
};

// In-memory storage
const rooms = new Map();

// Room structure
class Room {
  constructor(name = '') {
    this.id = this.generateRoomId();
    this.name = name || `Room ${this.id.substring(0, 4).toUpperCase()}`;
    this.connections = new Map(); // ws -> { userId, userLabel, lastPaste }
    this.pastes = [];
    this.userCounter = 0;
    this.deletionTimer = null;
  }

  generateRoomId() {
    // Generate a short, readable room ID
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  addUser(ws) {
    if (this.connections.size >= CONFIG.MAX_USERS_PER_ROOM) {
      return null;
    }
    
    this.userCounter++;
    const userId = uuidv4();
    const userLabel = `User ${this.userCounter}`;
    
    this.connections.set(ws, {
      userId,
      userLabel,
      lastPaste: 0,
      pasteCount: 0,
      pasteWindow: Date.now()
    });

    // Clear deletion timer if exists
    if (this.deletionTimer) {
      clearTimeout(this.deletionTimer);
      this.deletionTimer = null;
    }

    return { userId, userLabel };
  }

  removeUser(ws) {
    this.connections.delete(ws);
    return this.connections.size;
  }

  getUsers() {
    return Array.from(this.connections.values()).map(u => ({
      userId: u.userId,
      userLabel: u.userLabel
    }));
  }

  canPaste(ws) {
    const user = this.connections.get(ws);
    if (!user) return false;

    const now = Date.now();
    
    // Reset window if needed
    if (now - user.pasteWindow > CONFIG.RATE_LIMIT_WINDOW) {
      user.pasteCount = 0;
      user.pasteWindow = now;
    }

    return user.pasteCount < CONFIG.RATE_LIMIT_MAX;
  }

  addPaste(ws, content) {
    const user = this.connections.get(ws);
    if (!user) return null;

    // Rate limit check
    if (!this.canPaste(ws)) {
      return { error: 'Rate limit exceeded. Please slow down.' };
    }

    // Size check
    if (content.length > CONFIG.MAX_PASTE_SIZE) {
      return { error: `Paste too large. Maximum size is ${CONFIG.MAX_PASTE_SIZE / 1024} KB.` };
    }

    user.pasteCount++;

    const paste = {
      id: uuidv4(),
      userLabel: user.userLabel,
      content: content,
      timestamp: new Date().toISOString()
    };

    this.pastes.push(paste);
    return paste;
  }

  broadcast(message, excludeWs = null) {
    const data = JSON.stringify(message);
    this.connections.forEach((user, ws) => {
      if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (room) {
    res.json({
      exists: true,
      name: room.name,
      userCount: room.connections.size
    });
  } else {
    res.json({ exists: false });
  }
});

// WebSocket handling
wss.on('connection', (ws) => {
  let currentRoom = null;
  let pingInterval = null;

  // Setup ping/pong for connection health
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  pingInterval = setInterval(() => {
    if (!ws.isAlive) {
      clearInterval(pingInterval);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  }, 30000);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    handleDisconnect(ws);
  });

  ws.on('error', () => {
    clearInterval(pingInterval);
    handleDisconnect(ws);
  });

  function handleMessage(ws, message) {
    switch (message.type) {
      case 'create_room':
        handleCreateRoom(ws, message);
        break;
      case 'join_room':
        handleJoinRoom(ws, message);
        break;
      case 'paste':
        handlePaste(ws, message);
        break;
      case 'leave_room':
        handleDisconnect(ws);
        break;
    }
  }

  function handleCreateRoom(ws, message) {
    const room = new Room(message.name || '');
    rooms.set(room.id, room);
    
    const user = room.addUser(ws);
    currentRoom = room;

    ws.send(JSON.stringify({
      type: 'room_created',
      roomId: room.id,
      roomName: room.name,
      user: user,
      users: room.getUsers()
    }));

    console.log(`Room created: ${room.id} - ${room.name}`);
  }

  function handleJoinRoom(ws, message) {
    const roomId = (message.roomId || '').toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room does not exist'
      }));
      return;
    }

    const user = room.addUser(ws);
    if (!user) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Room is full'
      }));
      return;
    }

    currentRoom = room;

    // Send room state to joining user
    ws.send(JSON.stringify({
      type: 'room_joined',
      roomId: room.id,
      roomName: room.name,
      user: user,
      users: room.getUsers(),
      pastes: room.pastes
    }));

    // Notify others
    room.broadcast({
      type: 'user_joined',
      user: user,
      userCount: room.connections.size
    }, ws);

    console.log(`User joined room ${room.id}: ${user.userLabel}`);
  }

  function handlePaste(ws, message) {
    if (!currentRoom) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Not in a room'
      }));
      return;
    }

    const content = message.content || '';
    if (!content.trim()) {
      return;
    }

    const result = currentRoom.addPaste(ws, content);
    
    if (result.error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: result.error
      }));
      return;
    }

    // Broadcast paste to all users including sender
    currentRoom.broadcast({
      type: 'new_paste',
      paste: result
    });
  }

  function handleDisconnect(ws) {
    if (!currentRoom) return;

    const user = currentRoom.connections.get(ws);
    const remaining = currentRoom.removeUser(ws);

    if (user) {
      // Notify others
      currentRoom.broadcast({
        type: 'user_left',
        user: { userId: user.userId, userLabel: user.userLabel },
        userCount: remaining
      });

      console.log(`User left room ${currentRoom.id}: ${user.userLabel} (${remaining} remaining)`);
    }

    // Schedule room deletion if empty
    if (remaining === 0) {
      console.log(`Room ${currentRoom.id} empty, scheduling deletion in ${CONFIG.GRACE_PERIOD}ms`);
      
      currentRoom.deletionTimer = setTimeout(() => {
        if (currentRoom.connections.size === 0) {
          rooms.delete(currentRoom.id);
          console.log(`Room ${currentRoom.id} deleted`);
        }
      }, CONFIG.GRACE_PERIOD);
    }

    currentRoom = null;
  }
});

// Cleanup interval for dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Start server
server.listen(CONFIG.PORT, () => {
  console.log(`🚀 Chipku server running on http://localhost:${CONFIG.PORT}`);
});
