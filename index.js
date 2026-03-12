require('dotenv').config();

const app = require('express')();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const port  = process.env.PORT || 5000;
const masterKey  = process.env.MASTERKEY || "supersecret";
var sessionKey  = "";
var activeAdmin = null; // Track currently active named admin

// Parse admin passwords from environment variable
function parseAdmins() {
  const adminsEnv = process.env.ADMINS || "";
  if (!adminsEnv) return [];
  
  return adminsEnv.split(',').map(entry => {
    const [username, password, fullName] = entry.split(':');
    return { username: username?.trim(), password: password?.trim(), fullName: fullName?.trim() };
  }).filter(p => p.username && p.password && p.fullName);
}

const admins = parseAdmins();

// Middleware to parse JSON bodies
app.use(require('express').json());

// Helper function to check if password belongs to a named admin
function getAdminByPassword(password) {
    if (!password) return null;
    return admins.find(p => p.password === password);
}

// Helper function to check authorization (admin password > masterKey > sessionKey)
function isAuthorized(key, adminPassword) {
    // Priority 1: Admin password
    if (adminPassword && getAdminByPassword(adminPassword)) {
        return true;
    }
    
    // If there's an active named admin, block non-admin actions
    if (activeAdmin && !adminPassword) {
        console.log("Action blocked: Active admin session exists");
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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
  });
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.get('/piecon.js', (req, res) => {
    res.sendFile(__dirname + '/piecon.min.js');
});

// API endpoint to verify admin password
app.post('/api/admin/verify', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.json({ valid: false });
    }
    
    const admin = admins.find(p => p.password === password);
    
    if (admin) {
        console.log("Admin login: <" + admin.fullName + ">");
        return res.json({ 
            valid: true, 
            username: admin.username,
            fullName: admin.fullName 
        });
    }
    
    return res.json({ valid: false });
});

console.log("MasterKey: <"+masterKey+">");
console.log("SessionKey: <"+sessionKey+">");

http.listen(port, () => {
  console.log("Server ready on port " +  port);
});

// Timestamp-based timer (null when no timer is active)
var targetTime = null;

// Helper function to calculate time remaining
function getTimeRemaining() {
  if (!targetTime) return 0;
  return Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
}

// Periodic sync-check broadcast (every 15 seconds)
setInterval(() => {
  if (targetTime && targetTime > Date.now()) {
    io.sockets.emit('sync-check', {
      targetTime: targetTime,
      timeRemaining: getTimeRemaining()
    });
  }
}, 15000);

io.on('connection', (socket) => {
    console.log("New User Connected. Current Number: "+socket.client.conn.server.clientsCount);
        
    socket.on('disconnect', () => {
        console.log("User desconnected. Current Number: "+socket.client.conn.server.clientsCount);
        
        // If the disconnected socket was a named admin, clear the session
        if (activeAdmin && activeAdmin.socketId === socket.id) {
            console.log("Admin session ended (disconnected): <" + activeAdmin.fullName + ">");
            activeAdmin = null;
            io.sockets.emit("adminDisconnected");
        }
        
        if(socket.client.conn.server.clientsCount == 0){
            targetTime = null;
            console.log("Timer reset - all users disconnected")
            sessionKey = "";
        }
    });



    socket.on('setKey', (msg) => {
        

        if(msg.newKey == masterKey){
            io.sockets.emit("keyCleared");
            sessionKey = "";
            return;
        }
        
        console.log("Session Key Change Request: <"+ sessionKey+ "> -> <"+msg.newKey + "> with key <"+msg.key+"> or admin password");

        const admin = getAdminByPassword(msg.adminPassword);
        
        if(msg.newKey == sessionKey || msg.key == sessionKey || sessionKey == "" || admin) {
            sessionKey = msg.newKey;
            if (sessionKey != "")
                io.sockets.emit("keyChanged", {
                    successToken : msg.successToken
                });
            else
                io.sockets.emit("keyCleared");

        } else {
            
            io.sockets.emit("keyUnchanged", {
                successToken : msg.successToken
            });
            
            console.log("Dennied!");
        }
    });

    socket.on('reset', (msg) => {
        const oldRemaining = getTimeRemaining();
        const admin = getAdminByPassword(msg.adminPassword);
        console.log("Reset Request: "+oldRemaining+ "-> "+msg.data + " with key <"+msg.key+">" + (admin ? " by admin <" + admin.fullName + ">" : ""));

        if(isAuthorized(msg.key, msg.adminPassword)) {
            targetTime = Date.now() + (msg.data * 1000);
            io.sockets.emit("reset", {
                data: msg.data,
                targetTime: targetTime,
                timeRemaining: msg.data
            });
            
            // Emit admin info to all clients if action was by named admin
            if (admin) {
                io.sockets.emit("currentAdmin", {
                    fullName: admin.fullName,
                    username: admin.username
                });
            }
        } else {
            console.log("Dennied!");
        }
    });

    socket.on('addTime', (msg) => {
        const oldRemaining = getTimeRemaining();
        const admin = getAdminByPassword(msg.adminPassword);
        console.log("AddTime Request: +"+msg.data + " with key <"+msg.key+">" + (admin ? " by admin <" + admin.fullName + ">" : ""));

        if(isAuthorized(msg.key, msg.adminPassword)) {
            if (targetTime && targetTime > Date.now()) {
                targetTime += (msg.data * 1000);
            } else {
                targetTime = Date.now() + (msg.data * 1000);
            }
            const newRemaining = getTimeRemaining();
            io.sockets.emit("reset", {
                data: newRemaining,
                targetTime: targetTime,
                timeRemaining: newRemaining
            });
            
            // Emit admin info to all clients if action was by named admin
            if (admin) {
                io.sockets.emit("currentAdmin", {
                    fullName: admin.fullName,
                    username: admin.username
                });
            }
        } else {
            console.log("Dennied!");
        }
    });
    
    socket.on('sync', () => {
        const remaining = getTimeRemaining();
        io.sockets.emit("reset", {
            data: remaining,
            targetTime: targetTime,
            timeRemaining: remaining
        });
        
        // If there's an active named admin, notify the newly connected client
        if (activeAdmin) {
            socket.emit("currentAdmin", {
                fullName: activeAdmin.fullName,
                username: activeAdmin.username
            });
        }
    });
    
    // Named admin session management
    socket.on('adminConnected', (data) => {
        const admin = getAdminByPassword(data.password);
        if (admin) {
            activeAdmin = {
                fullName: admin.fullName,
                username: admin.username,
                socketId: socket.id
            };
            console.log("Admin session started: <" + admin.fullName + ">");
            
            // Broadcast to ALL clients
            io.sockets.emit("currentAdmin", {
                fullName: admin.fullName,
                username: admin.username
            });
        }
    });
    
    socket.on('adminDisconnected', () => {
        if (activeAdmin && activeAdmin.socketId === socket.id) {
            console.log("Admin session ended: <" + activeAdmin.fullName + ">");
            activeAdmin = null;
            
            // Broadcast to ALL clients
            io.sockets.emit("adminDisconnected");
        }
    });
});


