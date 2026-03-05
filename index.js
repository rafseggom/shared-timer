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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
  });
app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.get('/piecon.js', (req, res) => {
    res.sendFile(__dirname + '/piecon.min.js');
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
        
        console.log("Session Key Change Request: <"+ sessionKey+ "> -> <"+msg.newKey + "> with key <"+msg.key+">");

        if(msg.newKey == sessionKey || msg.key == sessionKey || sessionKey == "") {
            sessionKey = msg.newKey;
            if (sessionKey != "")
                io.sockets.emit("keyChanged", {
                    successToken : msg.successToken
                });
            else
                io.sockets.emit("keyCleared",);

        } else {
            
            io.sockets.emit("keyUnchanged", {
                successToken : msg.successToken
            });
            
            console.log("Dennied!");
        }
    });

    socket.on('reset', (msg) => {
        const oldRemaining = getTimeRemaining();
        console.log("Reset Request: "+oldRemaining+ "-> "+msg.data + " with key <"+msg.key+">");

        if(msg.key == masterKey || msg.key == sessionKey) {
            targetTime = Date.now() + (msg.data * 1000);
            io.sockets.emit("reset", {
                data: msg.data,
                targetTime: targetTime,
                timeRemaining: msg.data
            });
        } else {
            console.log("Dennied!");
        }
    });

    socket.on('addTime', (msg) => {
        const oldRemaining = getTimeRemaining();
        console.log("AddTime Request: +"+msg.data + " with key <"+msg.key+">");

        if(msg.key == masterKey || msg.key == sessionKey) {
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
    });
});


