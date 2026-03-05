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
var activeProfessor = null; // Track currently active professor

// Parse professor passwords from environment variable
function parseProfessors() {
  const profPasswordsEnv = process.env.PROF_PASSWORDS || "";
  if (!profPasswordsEnv) return [];
  
  return profPasswordsEnv.split(',').map(entry => {
    const [username, password, fullName] = entry.split(':');
    return { username: username?.trim(), password: password?.trim(), fullName: fullName?.trim() };
  }).filter(p => p.username && p.password && p.fullName);
}

const professors = parseProfessors();

// Middleware to parse JSON bodies
app.use(require('express').json());

// Helper function to check if password belongs to a professor
function getProfessorByPassword(password) {
    if (!password) return null;
    return professors.find(p => p.password === password);
}

// Helper function to check authorization (professor password > masterKey > sessionKey)
function isAuthorized(key, professorPassword) {
    // Priority 1: Professor password
    if (professorPassword && getProfessorByPassword(professorPassword)) {
        return true;
    }
    
    // If there's an active professor, block non-professor actions
    if (activeProfessor && !professorPassword) {
        console.log("Action blocked: Active professor session exists");
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

// API endpoint to verify professor password
app.post('/api/professor/verify', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.json({ valid: false });
    }
    
    const professor = professors.find(p => p.password === password);
    
    if (professor) {
        console.log("Professor login: <" + professor.fullName + ">");
        return res.json({ 
            valid: true, 
            username: professor.username,
            fullName: professor.fullName 
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
        
        // If the disconnected socket was a professor, clear the session
        if (activeProfessor && activeProfessor.socketId === socket.id) {
            console.log("Professor session ended (disconnected): <" + activeProfessor.fullName + ">");
            activeProfessor = null;
            io.sockets.emit("professorDisconnected");
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
        
        console.log("Session Key Change Request: <"+ sessionKey+ "> -> <"+msg.newKey + "> with key <"+msg.key+"> or professor password");

        const professor = getProfessorByPassword(msg.professorPassword);
        
        if(msg.newKey == sessionKey || msg.key == sessionKey || sessionKey == "" || professor) {
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
        const professor = getProfessorByPassword(msg.professorPassword);
        console.log("Reset Request: "+oldRemaining+ "-> "+msg.data + " with key <"+msg.key+">" + (professor ? " by professor <" + professor.fullName + ">" : ""));

        if(isAuthorized(msg.key, msg.professorPassword)) {
            targetTime = Date.now() + (msg.data * 1000);
            io.sockets.emit("reset", {
                data: msg.data,
                targetTime: targetTime,
                timeRemaining: msg.data
            });
            
            // Emit professor info to all clients if action was by professor
            if (professor) {
                io.sockets.emit("currentProfessor", {
                    fullName: professor.fullName,
                    username: professor.username
                });
            }
        } else {
            console.log("Dennied!");
        }
    });

    socket.on('addTime', (msg) => {
        const oldRemaining = getTimeRemaining();
        const professor = getProfessorByPassword(msg.professorPassword);
        console.log("AddTime Request: +"+msg.data + " with key <"+msg.key+">" + (professor ? " by professor <" + professor.fullName + ">" : ""));

        if(isAuthorized(msg.key, msg.professorPassword)) {
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
            
            // Emit professor info to all clients if action was by professor
            if (professor) {
                io.sockets.emit("currentProfessor", {
                    fullName: professor.fullName,
                    username: professor.username
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
        
        // If there's an active professor, notify the newly connected client
        if (activeProfessor) {
            socket.emit("currentProfessor", {
                fullName: activeProfessor.fullName,
                username: activeProfessor.username
            });
        }
    });
    
    // Professor session management
    socket.on('professorConnected', (data) => {
        const professor = getProfessorByPassword(data.password);
        if (professor) {
            activeProfessor = {
                fullName: professor.fullName,
                username: professor.username,
                socketId: socket.id
            };
            console.log("Professor session started: <" + professor.fullName + ">");
            
            // Broadcast to ALL clients
            io.sockets.emit("currentProfessor", {
                fullName: professor.fullName,
                username: professor.username
            });
        }
    });
    
    socket.on('professorDisconnected', () => {
        if (activeProfessor && activeProfessor.socketId === socket.id) {
            console.log("Professor session ended: <" + activeProfessor.fullName + ">");
            activeProfessor = null;
            
            // Broadcast to ALL clients
            io.sockets.emit("professorDisconnected");
        }
    });
});


