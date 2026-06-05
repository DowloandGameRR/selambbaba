const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    console.log('Bir kullanıcı bağlandı:', socket.id);

    // Aktif odaları listeleme fonksiyonu
    function sendRoomList(targetSocket = io) {
        const list = Object.keys(rooms).map(name => ({
            name,
            players: rooms[name].players.length,
            started: rooms[name].started,
            hasPassword: rooms[name].password ? true : false
        }));
        targetSocket.emit('roomList', list);
    }

    socket.on('getRooms', () => {
        sendRoomList(socket);
    });

    socket.on('createRoom', ({ roomName, password }) => {
        if (!roomName) return;
        if (rooms[roomName]) {
            socket.emit('errorMsg', 'Bu oda zaten mevcut!');
            return;
        }
        rooms[roomName] = { password: password || "", players: [], started: false };
        socket.emit('roomCreated', { roomName, password: password || "" });
        sendRoomList();
    });

    socket.on('joinRoom', ({ roomName, password, username, color }) => {
        const room = rooms[roomName];
        if (!room) {
            socket.emit('errorMsg', 'Oda bulunamadı!');
            return;
        }
        if (room.password && room.password !== password) {
            socket.emit('errorMsg', 'Hatalı oda şifresi!');
            return;
        }
        if (room.players.length >= 4) {
            socket.emit('errorMsg', 'Oda dolu! (Maks 4 oyuncu)');
            return;
        }
        if (room.started) {
            socket.emit('errorMsg', 'Oyun zaten başladı!');
            return;
        }

        socket.join(roomName);
        socket.roomName = roomName;

        const playerObj = {
            id: socket.id,
            username: username || 'Savaşçı',
            color: color || '#00ffcc',
            x: 100 + (room.players.length * 180),
            y: 300,
            hp: 100,
            score: 0
        };
        
        room.players.push(playerObj);
        io.to(roomName).emit('roomData', room.players);
        sendRoomList();
    });

    socket.on('chatMessage', (msg) => {
        if (socket.roomName && rooms[socket.roomName]) {
            const room = rooms[socket.roomName];
            const player = room.players.find(p => p.id === socket.id);
            const sender = player ? player.username : 'Sistem';
            io.to(socket.roomName).emit('newChatMessage', { sender, msg });
        }
    });

    socket.on('startGame', () => {
        const roomName = socket.roomName;
        if (rooms[roomName]) {
            rooms[roomName].started = true;
            io.to(roomName).emit('gameStarted');
            sendRoomList();
        }
    });

    socket.on('playerMove', (data) => {
        const room = rooms[socket.roomName];
        if (room && room.started) {
            const player = room.players.find(p => p.id === socket.id);
            if (player && player.hp > 0) {
                player.x = data.x;
                player.y = data.y;
                socket.to(socket.roomName).emit('playerUpdated', player);
            }
        }
    });

    socket.on('fireBullet', (bulletData) => {
        socket.to(socket.roomName).emit('bulletSpawned', { ...bulletData, owner: socket.id });
    });

    socket.on('bulletHit', ({ targetId }) => {
        const room = rooms[socket.roomName];
        if (room && room.started) {
            const target = room.players.find(p => p.id === targetId);
            const attacker = room.players.find(p => p.id === socket.id);
            
            if (target && target.hp > 0) {
                target.hp -= 10;
                if (target.hp <= 0) {
                    target.hp = 0;
                    if (attacker) attacker.score += 1;
                }
                io.to(socket.roomName).emit('roomData', room.players);
                
                const alivePlayers = room.players.filter(p => p.hp > 0);
                if (alivePlayers.length <= 1 && room.players.length > 1) {
                    const winner = alivePlayers[0] ? alivePlayers[0].username : 'Kimse';
                    io.to(socket.roomName).emit('gameOver', { winner });
                    
                    // Oyun bittiğinde odayı ve oyuncu canlarını temizle
                    room.started = false;
                    room.players.forEach((p, index) => { 
                        p.hp = 100; 
                        p.x = 100 + (index * 180); 
                        p.y = 300; 
                    });
                    setTimeout(() => {
                        io.to(socket.roomName).emit('roomData', room.players);
                    }, 3100);
                }
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomName && rooms[socket.roomName]) {
            const room = rooms[socket.roomName];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[socket.roomName];
            } else {
                io.to(socket.roomName).emit('roomData', room.players);
                if (room.started && room.players.filter(p => p.hp > 0).length <= 1) {
                    const alive = room.players.filter(p => p.hp > 0)[0];
                    io.to(socket.roomName).emit('gameOver', { winner: alive ? alive.username : 'Kimse' });
                    room.started = false;
                    room.players.forEach((p, idx) => { p.hp = 100; p.x = 100 + (idx * 180); p.y = 300; });
                }
            }
            sendRoomList();
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Sunucu aktif port: ${PORT}`);
});
