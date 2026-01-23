# 📋 Chipku - Temporary Shared Paste Rooms

A real-time collaborative paste room that exists only while people are inside it.

## ✨ Features

- **No login required** - Just create or join a room
- **Real-time sync** - Pastes appear instantly for all users
- **Ephemeral** - Room is deleted when the last user leaves
- **Simple** - No file uploads, no history, no complexity

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher

### Installation

```bash
# Clone or navigate to the project
cd Chipku

# Install dependencies
npm install

# Start the server
npm start
```

The server will start at `http://localhost:3000`

## 🎯 How to Use

1. **Create a Room**
   - Click "Create a Paste Room"
   - Optionally enter a room name
   - Share the Room ID with others

2. **Join a Room**
   - Click "Join a Paste Room"
   - Enter the 6-character Room ID
   - Start pasting!

3. **Share Content**
   - Type or paste text in the input box
   - Press Send or Ctrl+Enter
   - Everyone in the room sees it instantly

4. **Copy Content**
   - Click any paste to copy it to your clipboard

## 🧱 Architecture

```
Chipku/
├── server.js          # Express + WebSocket server
├── package.json       # Dependencies
└── public/
    ├── index.html     # Single-page app
    ├── styles.css     # Dark theme UI
    └── app.js         # Client-side logic
```

### Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Storage**: In-memory (no database)

## 🔐 Abuse Protection

- Max paste size: 20 KB
- Rate limit: 5 pastes per second per user
- Max users per room: 20
- Grace period: 10 seconds before room deletion (prevents accidental deletion on refresh)

## 🧾 Room Lifecycle

1. Room is created when a user clicks "Create a Paste Room"
2. Room exists as long as at least 1 user is connected
3. When the last user disconnects:
   - A 10-second grace period starts
   - If no one reconnects, the room is permanently deleted
   - All pastes, metadata, and user labels are gone forever

## 📡 WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `create_room` | `{ name?: string }` | Create a new room |
| `join_room` | `{ roomId: string }` | Join an existing room |
| `paste` | `{ content: string }` | Send a paste |
| `leave_room` | `{}` | Leave the current room |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room_created` | `{ roomId, roomName, user, users }` | Room successfully created |
| `room_joined` | `{ roomId, roomName, user, users, pastes }` | Successfully joined room |
| `user_joined` | `{ user, userCount }` | A new user joined |
| `user_left` | `{ user, userCount }` | A user left |
| `new_paste` | `{ paste }` | A new paste was shared |
| `error` | `{ message }` | An error occurred |

## 🌐 Deployment

### Environment Variables

- `PORT` - Server port (default: 3000)

### Docker (coming soon)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## 📝 License

MIT
