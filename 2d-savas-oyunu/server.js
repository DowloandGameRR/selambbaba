const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

app.use(express.static('public'));

let rooms = {}; 

// GÜVENLİ SPAWN NOKTASI BULMA FONKSİYONU
function getSafeSpawnPoint(room) {
    let mapSize = room.mapSize;
    let safeX = Math.random() * (mapSize - 400) + 200;
    let safeY = Math.random() * (mapSize - 400) + 200;
    let attempts = 0;
    let isSafe = false;

    while (!isSafe && attempts < 50) {
        isSafe = true;
        let playersArr = Object.values(room.players);
        
        for (let p of playersArr) {
            let dx = safeX - p.x;
            let dy = safeY - p.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            
            // Eğer başka bir oyuncuya 250 pikselden daha yakınsa koordinat güvenli değildir
            if (distance < 250) {
                isSafe = false;
                safeX = Math.random() * (mapSize - 400) + 200;
                safeY = Math.random() * (mapSize - 400) + 200;
                break;
            }
        }
        attempts++;
    }
    return { x: safeX, y: safeY };
}

io.on('connection', (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    socket.on('getRooms', () => {
        socket.emit('roomListUpdate', getCleanRoomList());
    });

    socket.on('createRoom', (data) => {
        let roomId = 'room_' + Math.random().toString(36).substring(2, 9);
        
        rooms[roomId] = {
            id: roomId,
            name: data.roomName,
            password: data.isPrivate ? data.password : null,
            isPrivate: data.isPrivate,
            hostId: socket.id,
            started: false,
            gameOver: false,
            mapSize: 2000,       
            playerSpeed: 6,     
            gameDuration: 180, 
            timeLeft: 180,
            timerInterval: null,
            players: {},
            bullets: []
        };

        socket.emit('roomCreated', roomId);
        io.emit('roomListUpdate', getCleanRoomList());
    });

    socket.on('joinRoom', (data) => {
        let room = rooms[data.roomId];
        if (!room) return socket.emit('errorMsg', 'Oda bulunamadı!');
        if (room.started) return socket.emit('errorMsg', 'Oyun çoktan başladı!');
        if (room.isPrivate && room.password !== data.password) return socket.emit('errorMsg', 'Hatalı şifre!');

        socket.join(data.roomId);
        socket.roomId = data.roomId;

        let spawn = getSafeSpawnPoint(room);

        room.players[socket.id] = {
            id: socket.id,
            username: data.username,
            x: spawn.x,
            y: spawn.y,
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            kills: 0,
            hp: 100,
            isHost: room.hostId === socket.id
        };

        io.to(data.roomId).emit('lobbyUpdate', {
            players: room.players,
            myId: socket.id,
            hostId: room.hostId,
            roomName: room.name,
            mapSize: room.mapSize,
            playerSpeed: room.playerSpeed,
            gameDuration: room.gameDuration
        });
        
        io.emit('roomListUpdate', getCleanRoomList());
    });

    socket.on('updateLobbySettings', (data) => {
        let roomId = socket.roomId;
        if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
            rooms[roomId].mapSize = Math.max(1000, Math.min(200000, parseInt(data.mapSize) || 2000));
            rooms[roomId].playerSpeed = parseInt(data.playerSpeed);
            rooms[roomId].gameDuration = parseInt(data.gameDuration);
            rooms[roomId].timeLeft = rooms[roomId].gameDuration;
            
            io.to(roomId).emit('settingsUpdated', {
                mapSize: rooms[roomId].mapSize,
                playerSpeed: rooms[roomId].playerSpeed,
                gameDuration: rooms[roomId].gameDuration
            });
        }
    });

    socket.on('startGame', () => {
        let roomId = socket.roomId;
        let room = rooms[roomId];
        if (room && room.hostId === socket.id && !room.started) {
            room.started = true;
            room.gameOver = false;
            room.timeLeft = room.gameDuration;

            room.timerInterval = setInterval(() => {
                if (!room) return;
                room.timeLeft--;
                
                io.to(roomId).emit('timerUpdate', room.timeLeft);

                if (room.timeLeft <= 0) {
                    clearInterval(room.timerInterval);
                    room.gameOver = true;
                    
                    let playerArr = Object.values(room.players);
                    let winner = { username: "Hiç kimse", kills: 0, color: "#fff" };
                    if (playerArr.length > 0) {
                        playerArr.sort((a,b) => b.kills - a.kills);
                        winner = playerArr[0];
                    }

                    io.to(roomId).emit('matchEnded', {
                        winnerName: winner.username,
                        winnerKills: winner.kills,
                        winnerColor: winner.color
                    });
                }
            }, 1000);

            Object.keys(room.players).forEach(pId => {
                let sPoint = getSafeSpawnPoint(room);
                room.players[pId].x = sPoint.x;
                room.players[pId].y = sPoint.y;
                room.players[pId].hp = 100;
                room.players[pId].kills = 0;
            });

            io.to(roomId).emit('gameStarted', {
                players: room.players,
                mapSize: room.mapSize
            });
            io.emit('roomListUpdate', getCleanRoomList());
        }
    });

    socket.on('playerMove', (keys) => {
        let roomId = socket.roomId;
        if (!roomId || !rooms[roomId] || !rooms[roomId].players[socket.id] || rooms[roomId].gameOver) return;

        let room = rooms[roomId];
        let player = room.players[socket.id];
        let speed = room.playerSpeed;

        if (keys.w) player.y -= speed;
        if (keys.s) player.y += speed;
        if (keys.a) player.x -= speed;
        if (keys.d) player.x += speed;

        player.x = Math.max(40, Math.min(room.mapSize - 40, player.x));
        player.y = Math.max(40, Math.min(room.mapSize - 40, player.y));

        io.to(roomId).emit('playerMoved', player);
    });

    socket.on('shoot', (shootData) => {
        let roomId = socket.roomId;
        if (!roomId || !rooms[roomId] || !rooms[roomId].players[socket.id] || rooms[roomId].gameOver) return;

        rooms[roomId].bullets.push({
            owner: socket.id,
            x: rooms[roomId].players[socket.id].x,
            y: rooms[roomId].players[socket.id].y,
            dirX: shootData.dirX,
            dirY: shootData.dirY,
            speed: 15,
            id: Math.random()
        });
    });

    socket.on('disconnect', () => {
        let roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            delete rooms[roomId].players[socket.id];
            
            if (Object.keys(rooms[roomId].players).length === 0) {
                if (rooms[roomId].timerInterval) clearInterval(rooms[roomId].timerInterval);
                delete rooms[roomId];
            } else if (rooms[roomId].hostId === socket.id) {
                let nextHost = Object.keys(rooms[roomId].players)[0];
                rooms[roomId].hostId = nextHost;
                rooms[roomId].players[nextHost].isHost = true;
                
                io.to(roomId).emit('lobbyUpdate', {
                    players: rooms[roomId].players,
                    myId: nextHost,
                    hostId: rooms[roomId].hostId,
                    roomName: rooms[roomId].name,
                    mapSize: rooms[roomId].mapSize,
                    playerSpeed: rooms[roomId].playerSpeed,
                    gameDuration: rooms[roomId].gameDuration
                });
            }
            io.to(roomId).emit('playerDisconnected', socket.id);
            io.emit('roomListUpdate', getCleanRoomList());
        }
    });
});

function getCleanRoomList() {
    return Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        isPrivate: r.isPrivate,
        playerCount: Object.keys(r.players).length,
        started: r.started
    }));
}

setInterval(() => {
    Object.keys(rooms).forEach(roomId => {
        let room = rooms[roomId];
        if (!room.started || room.gameOver) return;

        room.bullets.forEach((bullet, bIndex) => {
            bullet.x += bullet.dirX * bullet.speed;
            bullet.y += bullet.dirY * bullet.speed;

            if (bullet.x < 0 || bullet.x > room.mapSize || bullet.y < 0 || bullet.y > room.mapSize) {
                room.bullets.splice(bIndex, 1);
                return;
            }

            Object.keys(room.players).forEach((pId) => {
                if (bullet.owner !== pId) {
                    let p = room.players[pId];
                    let dx = bullet.x - p.x;
                    let dy = bullet.y - p.y;

                    if (Math.sqrt(dx*dx + dy*dy) < 30) {
                        p.hp -= 20;
                        room.bullets.splice(bIndex, 1);

                        if (p.hp <= 0) {
                            if (room.players[bullet.owner]) room.players[bullet.owner].kills += 1;
                            
                            let respawnPos = getSafeSpawnPoint(room);
                            p.hp = 100;
                            p.x = respawnPos.x;
                            p.y = respawnPos.y;
                        }
                        io.to(roomId).emit('updateAllPlayers', room.players);
                    }
                }
            });
        });

        io.to(roomId).emit('updateBullets', room.bullets);
    });
}, 1000 / 60);

// PORT AYARI (Render/Cloud platform uyumluluğu için)
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Sunucu ${PORT} portunda başarıyla başlatıldı.`));