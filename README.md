# shared-timer

Super simple (and **cloud ready**) shared timer using websockets (thanks to [socket.io](https://socket.io)).

## Features

### Core Features
- **Real-time synchronized countdown timer** across all connected clients
- **Cloud-ready** with WebSocket support (Socket.IO)
- **Mobile-friendly** responsive interface
- **Automatic reconnection** with session restoration

### Access Control
- **Professor authentication** with absolute permissions
- **Hierarchical permission system** (Professor > Master > Session > Admin)
- **Professor blocking**: When a professor is active, all other users are blocked
- **Session persistence**: Logins survive page reloads via localStorage
- **Multi-level keys**: Master key, session keys, and professor passwords

### Visual Features
- **Dynamic color coding**:
  - Normal: White background
  - Warning (≤33%): Yellow background
  - Critical (≤20%): Red background
- **Activity log**: Real-time feed of timer modifications (bottom-right)
- **Professor banner**: Visible indicator when a professor is in control
- **Progress bar** with visual indicators

### Admin Interface
- **Quick time additions**: 1-5 minutes, 5-45 seconds
- **Timer reset** with custom duration
- **Key management**: Set/clear session keys
- **Professor login** directly from admin panel

## Installation

```bash
git clone https://github.com/pafmon/shared-timer.git
cd shared-timer
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and configure your settings:

```env
# Server port
PORT=5000

# Master key (absolute access from environment variable)
MASTERKEY=supersecret

# Professor passwords
# Format: username:password:Full Name,username2:password2:Full Name 2
PROF_PASSWORDS=john:YourSecurePass1:John Doe,jane:AnotherSecurePass2:Jane Smith
```

### Professor Passwords Format

Configure your professors in the `PROF_PASSWORDS` environment variable using this format:

```
username:password:Full Name,username2:password2:Full Name 2
```

**Example:**
```
PROF_PASSWORDS=john:YourSecurePass1:John Doe,jane:AnotherSecurePass2:Jane Smith
```

- **username**: Identifier for the professor (not shown in UI)
- **password**: Secret password only the professor knows
- **Full Name**: Display name shown in banners and badges

**Security Note**: Use strong passwords and keep them secret. Never commit the `.env` file to git.

## Starting the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

If `$PORT` is not set, by default it launches a server on port 5000.

## Usage

### Views

- **Main timer view**: `http://localhost:5000`
  - Shows the countdown timer
  - Read-only for regular users
  - Real-time synchronization with all connected clients
  
- **Admin interface**: `http://localhost:5000/admin`
  - Requires password to access (default: `admin123`)
  - Provides controls to manage the timer
  - Shows activity log and professor status

## Authentication & Permission System

The application implements a **hierarchical permission system** where higher-level credentials override lower ones.

### Permission Hierarchy (Highest to Lowest)

```
1. Professor Password    ← ABSOLUTE CONTROL (blocks all others)
   ↓
2. Master Key           ← Server administrator control
   ↓
3. Session Key          ← Shared temporary key
   ↓
4. Admin Interface      ← View access only (admin123)
```

### Professor Accounts (Level 1 - Highest Priority)

**What it is:**
- Special accounts with **absolute control** over the timer
- Configured by server administrator in `.env` file
- Cannot be modified by regular users

**What it does:**
- **Full timer control** without needing any keys
- **Blocks all other users** when active (even those with session/master keys)
- **Visible to everyone**: A banner shows all users who is in control
- **Persistent sessions**: Login survives page reloads (stored in browser)

**How to use:**
1. Go to `/admin` and log in with `admin123` (or use your professor password directly)
2. Click "Login Profesor"
3. Enter your professor password
4. The UI shows: "PROFESOR - [Your Name]"
5. All users see: "Timer controlado por Profesor [Your Name]"
6. Control the timer freely—no keys needed!

**Logout:**
- Click the "Logout" button in your professor badge
- Or close your browser (session clears)

### Master Key (Level 2)

**What it is:**
- Server-wide administrator password (set in `.env`)
- Known only by the server administrator

**What it does:**
- Full control over timer
- Can set/clear session keys
- **Blocked if a professor is active**

**How to use:**
- Enter it in the "Security Key" field in `/admin`

### Session Key (Level 3)

**What it is:**
- Temporary shared password set by users
- Resets when all users disconnect
- Changes automatically if cleared or replaced

**What it does:**
- Grants timer control to anyone who knows it
- Can be changed by anyone with current session key or master key
- **Blocked if a professor is active**

**How to use:**
1. In `/admin`, enter a new key in "Security Key" field
2. Click "Set"
3. Share this key with users you want to grant access
4. They enter the same key to control the timer

**Auto-reset:**
- When all users disconnect, the session key is cleared

### Admin Interface Access (Level 4 - View Only)

**What it is:**
- Basic password to access the admin interface
- Hardcoded as `admin123`

**What it does:**
- Grants access to `/admin` view
- Does NOT grant timer control (you still need a key or professor login)

**How to use:**
- Navigate to `/admin`
- Enter `admin123` when prompted

### Professor Blocking Mechanism

When a professor logs in:
- **All non-professor actions are blocked** on the server
- Users with session keys **cannot** modify the timer
- Users with master key **cannot** override (unless they also log in as professor)
- **All connected users** see a banner indicating professor control
- The professor can control the timer without any keys

This ensures **absolute professor authority** during active sessions.

### Session Persistence

The application remembers your login across page reloads:

- **Professor logins** persist in browser localStorage
- **Session keys** persist if you set them
- **Reconnection**: If you lose connection, your session restores automatically
- **Cleared on logout** or when you explicitly log out

### Use Cases

**Scenario 1: Regular classroom use**
- Teacher uses `admin123` to access `/admin`
- Teacher sets a session key and shares it with students
- Students use the key to control the timer during activities

**Scenario 2: Professor authority**
- Professor logs in with professor password
- Professor has full control, students are blocked
- Professor's name is visible to everyone
- No keys needed

**Scenario 3: Administrator override**
- Admin uses master key to reset timer
- Can clear rogue session keys
- Cannot override an active professor session

## Technical Implementation

### Timer Architecture: Before vs. After

#### Original Implementation (Client-Side Decrementing)

The original version used a **client-side decrementing** approach:

```javascript
// Client-side timer (original)
var t = 15; // seconds remaining

setInterval(function() {
    if (t > 0) {
        t--; // Decrement every second
    }
    updateDisplay(t);
}, 1000);

socket.on('reset', function(msg) {
    t = msg.data; // Set new time
});
```

**Problems:**
- **Drift**: Each client decrements independently, leading to desynchronization
- **Inaccurate**: setInterval is not precise (browser throttling, tab backgrounding)
- **Fragile**: Adding time requires manual synchronization across all clients
- **Race conditions**: Rapid updates could cause inconsistent states

#### Current Implementation (Timestamp-Based Synchronization)

The enhanced version uses **server-authoritative timestamp synchronization**:

```javascript
// Client-side timer (current)
var targetTime = null; // Unix timestamp (ms) when timer expires

setInterval(function() {
    if (targetTime) {
        // Calculate remaining time from current timestamp
        var t = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
    }
    updateDisplay(t);
}, 1000);

socket.on('reset', function(msg) {
    targetTime = msg.targetTime; // Server provides authoritative timestamp
});
```

**Server-side (index.js):**
```javascript
var targetTime = null; // Server's authoritative target timestamp

socket.on('reset', function(msg) {
    if (isAuthorized(msg.key, msg.professorPassword)) {
        targetTime = Date.now() + (msg.data * 1000);
        io.sockets.emit('reset', {
            targetTime: targetTime,
            timeRemaining: msg.data
        });
    }
});

socket.on('addTime', function(msg) {
    if (isAuthorized(msg.key, msg.professorPassword)) {
        targetTime += (msg.data * 1000); // Add to existing timestamp
        io.sockets.emit('reset', {
            targetTime: targetTime,
            timeRemaining: getTimeRemaining()
        });
    }
});
```

**Advantages:**
- **Perfect synchronization**: All clients calculate from the same server timestamp
- **Resilient**: Network delays don't affect accuracy
- **Simple additions**: Adding time is just `targetTime += seconds`
- **Reconnection-friendly**: New clients get current `targetTime` on sync
- **No drift**: Calculation based on real time, not incremental counting

### Socket.IO Event Architecture

**Client → Server Events:**
- `sync`: Request current timer state (on connect/reconnect)
- `reset`: Set timer to specific duration
- `addTime`: Add seconds to current timer
- `setKey`: Change session key
- `professorConnected`: Notify server of professor login
- `professorDisconnected`: Notify server of professor logout

**Server → Client Events:**
- `reset`: Update timer with new `targetTime` and remaining seconds
- `sync-check`: Periodic broadcast (every 15s) to verify synchronization
- `keyChanged`: Session key was successfully changed
- `keyCleared`: Session key was cleared
- `keyUnchanged`: Key change was blocked
- `currentProfessor`: A professor is now controlling the timer
- `professorDisconnected`: Professor control ended

### Authorization Flow

```javascript
function isAuthorized(key, professorPassword) {
    // Priority 1: Professor password
    if (professorPassword && getProfessorByPassword(professorPassword)) {
        return true;
    }
    
    // Block if professor is active
    if (activeProfessor && !professorPassword) {
        return false;
    }
    
    // Priority 2: Master key
    if (key === masterKey) {
        return true;
    }
    
    // Priority 3: Session key
    if (key === sessionKey) {
        return true;
    }
    
    return false;
}
```

### Persistence Strategy

**localStorage Schema:**
```javascript
{
    "professor": {
        "password": "encrypted_string",
        "username": "john",
        "fullName": "John Doe"
    },
    "key": "current_session_key",
    "isAdmin": true,
    "timestamp": 1234567890
}
```

**Restoration on page load:**
1. Check localStorage for saved session
2. If professor session exists, verify password with server (`/api/professor/verify`)
3. If valid, restore `currentProfessor` object and emit `professorConnected`
4. Restore session key if present
5. Update UI accordingly

**Reconnection handling:**
- On `socket.on('connect')`, check if `currentProfessor` exists
- If yes, re-emit `professorConnected` to restore server-side state
- Server broadcasts professor status to all clients

## Development

- The project uses `nodemon` for development with hot-reload
- Edit files and the server will restart automatically
- Logs are displayed in the console

## Project Evolution

### Original Version
The original shared-timer by @pafmon provided:
- Basic synchronized timer
- Simple admin interface with `admin123` password
- Master key and session key system

### Current Version (Enhanced)
This fork adds significant improvements:

**Authentication System:**
- Professor accounts with absolute control
- Active blocking when professors are controlling the timer
- Session persistence across page reloads
- Automatic session restoration on reconnect

**Visual Enhancements:**
- Real-time activity log
- Professor control banner visible to all users
- Improved color thresholds (33% warning, 20% critical)
- Optimized admin layout with scrollable cards

**User Experience:**
- Smaller timer in admin view for better screen utilization
- Professor status badges
- Clear visual hierarchy of controls
- Mobile-responsive design improvements

**Security:**
- Environment-based credential management
- Four-tier permission hierarchy
- Server-side enforcement of professor privileges
- No credentials exposed to clients

## Credits

- **Original Author**: [@pafmon](https://github.com/pafmon)
- **Enhanced Fork**: [@rafseggom](https://github.com/rafseggom)
- **Made for**: [ETSII - Universidad de Sevilla](https://www.informatica.us.es/)

## License

ISC

