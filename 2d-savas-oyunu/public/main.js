// Sunucu adresi kontrolü: Localhost ise yerel sunucuya, değilse Render linkine otomatik yönlenir.
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://RENDER_SUNUCU_LINKINIZI_BURAYA_KOYUN.onrender.com'); 

// Ekranlar
const nameScreen = document.getElementById('name-screen');
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const victoryScreen = document.getElementById('victory-screen');
const canvas = document.getElementById('gameCanvas');
const leaderboard = document.getElementById('leaderboard');
const gameTimerDiv = document.getElementById('game-timer');

const usernameInput = document.getElementById('username-input');
const saveNameBtn = document.getElementById('save-name-btn');
const helloUsername = document.getElementById('hello-username');
const roomNameInput = document.getElementById('room-name');
const isPrivateCheck = document.getElementById('is-private');
const passwordWrapper = document.getElementById('password-wrapper');
const roomPassInput = document.getElementById('room-pass');
const createBtn = document.getElementById('create-btn');
const roomListDiv = document.getElementById('room-list');

// Lobi Elemanları
const lobbyTitle = document.getElementById('lobby-title');
const lobbyPlayersDiv = document.getElementById('lobby-players');
const mapSizeInput = document.getElementById('map-size-input');
const playerSpeedSelect = document.getElementById('player-speed-select');
const gameDurationSelect = document.getElementById('game-duration-select');
const startBtn = document.getElementById('start-game-btn');
const waitMsg = document.getElementById('wait-msg');
const scoresDiv = document.getElementById('scores');
const winnerNameBox = document.getElementById('winner-name-box');
const winnerKillsBox = document.getElementById('winner-kills-box');
const returnMenuBtn = document.getElementById('return-menu-btn');

const ctx = canvas.getContext('2d');

let players = {};
let bullets = [];
let currentMapSize = 2000; 
let keys = { w: false, a: false, s: false, d: false };
let starParticles = [];
let isGameActive = false;
let myUsername = ""; 

canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.9;

saveNameBtn.addEventListener('click', () => {
    let name = usernameInput.value.trim();
    if (!name) return alert("Karakter ismi girin!");
    myUsername = name; 
    
    nameScreen.style.display = 'none';
    menuScreen.style.display = 'block';
    helloUsername.innerText = myUsername.toUpperCase();
    socket.emit('getRooms');
});

isPrivateCheck.addEventListener('change', (e) => {
    passwordWrapper.style.display = e.target.checked ? 'block' : 'none';
});

createBtn.addEventListener('click', () => {
    let rName = roomNameInput.value.trim();
    if (!rName) return alert("Oda adı girilmeli!");
    socket.emit('createRoom', { roomName: rName, isPrivate: isPrivateCheck.checked, password: roomPassInput.value });
});

socket.on('roomCreated', (roomId) => {
    socket.emit('joinRoom', { roomId: roomId, username: myUsername, password: roomPassInput.value });
});

socket.on('roomListUpdate', (rooms) => {
    roomListDiv.innerHTML = '';
    let available = rooms.filter(r => !r.started);
    if(available.length === 0) {
        roomListDiv.innerHTML = '<p style="color:#555;font-size:13px;margin-top:10px;">Aktif turnuva odası yok.</p>';
        return;
    }
    available.forEach(room => {
        let lock = room.isPrivate ? "🔒 " : "🌐 ";
        roomListDiv.innerHTML += `
            <div class="room-item">
                <span>${lock}<b>${room.name}</b> (${room.playerCount} Oyuncu)</span>
                <button onclick="checkAndJoin('${room.id}', ${room.isPrivate})">Katıl</button>
            </div>
        `;
    });
});

window.checkAndJoin = function(roomId, isPrivate) {
    let pass = "";
    if (isPrivate) {
        pass = prompt("Turnuva odası şifresini yazın:");
        if (pass === null) return;
    }
    socket.emit('joinRoom', { roomId, username: myUsername, password: pass });
};

socket.on('lobbyUpdate', (data) => {
    menuScreen.style.display = 'none';
    lobbyScreen.style.display = 'block';
    lobbyTitle.innerText = "Oda: " + data.roomName;
    lobbyPlayersDiv.innerHTML = '';
    
    Object.values(data.players).forEach(p => {
        let tag = p.id === data.hostId ? " [ODA SAHİBİ]" : "";
        lobbyPlayersDiv.innerHTML += `<div class="lobby-player" style="color:${p.color}">${p.username}${tag}</div>`;
    });

    if (socket.id === data.hostId) {
        mapSizeInput.disabled = false;
        playerSpeedSelect.disabled = false;
        gameDurationSelect.disabled = false;
        startBtn.style.display = 'inline-block';
        waitMsg.style.display = 'none';
    } else {
        mapSizeInput.disabled = true;
        playerSpeedSelect.disabled = true;
        gameDurationSelect.disabled = true;
        mapSizeInput.value = data.mapSize;
        playerSpeedSelect.value = data.playerSpeed;
        gameDurationSelect.value = data.gameDuration;
    }
});

function sendSettings() {
    socket.emit('updateLobbySettings', {
        mapSize: mapSizeInput.value,
        playerSpeed: playerSpeedSelect.value,
        gameDuration: gameDurationSelect.value
    });
}
mapSizeInput.addEventListener('input', sendSettings);
playerSpeedSelect.addEventListener('change', sendSettings);
gameDurationSelect.addEventListener('change', sendSettings);

socket.on('settingsUpdated', (data) => {
    mapSizeInput.value = data.mapSize;
    playerSpeedSelect.value = data.playerSpeed;
    gameDurationSelect.value = data.gameDuration;
});

startBtn.addEventListener('click', () => { socket.emit('startGame'); });

socket.on('gameStarted', (data) => {
    lobbyScreen.style.display = 'none';
    canvas.style.display = 'block';
    leaderboard.style.display = 'block';
    gameTimerDiv.style.display = 'block';
    players = data.players;
    currentMapSize = data.mapSize;
    isGameActive = true;

    starParticles = [];
    let count = 200; 
    for(let i=0; i<count; i++) {
        starParticles.push({
            x: Math.random() * currentMapSize,
            y: Math.random() * currentMapSize,
            size: Math.random() * 2 + 1,
            alpha: Math.random() * 0.6 + 0.2,
            speed: Math.random() * 0.4 + 0.1
        });
    }

    updateLeaderboard();
    animate();
});

socket.on('timerUpdate', (timeLeft) => {
    let minutes = Math.floor(timeLeft / 60);
    let seconds = timeLeft % 60;
    gameTimerDiv.innerText = `KALAN SÜRE: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

socket.on('matchEnded', (data) => {
    isGameActive = false;
    winnerNameBox.innerText = data.winnerName;
    winnerNameBox.style.color = data.winnerColor;
    winnerKillsBox.innerText = `${data.winnerKills} Leş Alarak Arenanın Hakimi Oldu!`;
    victoryScreen.style.display = 'flex';
});

// İSİM SIFIRLAMADAN DOĞRUDAN LOBİ MENÜSÜNE GERİ DÖNME TETİKLEYİCİSİ
returnMenuBtn.addEventListener('click', () => {
    victoryScreen.style.display = 'none';
    canvas.style.display = 'none';
    leaderboard.style.display = 'none';
    gameTimerDiv.style.display = 'none';
    
    menuScreen.style.display = 'block';
    
    roomNameInput.value = "";
    roomPassInput.value = "";
    isPrivateCheck.checked = false;
    passwordWrapper.style.display = 'none';
    socket.emit('getRooms');
});

window.addEventListener('keydown', (e) => {
    let key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) keys[key] = true;
});
window.addEventListener('keyup', (e) => {
    let key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) keys[key] = false;
});

let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

window.addEventListener('mousedown', () => {
    if (!players[socket.id] || !isGameActive) return;
    let dirX = mouseX - canvas.width / 2;
    let dirY = mouseY - canvas.height / 2;
    let len = Math.sqrt(dirX*dirX + dirY*dirY);
    if (len > 0) socket.emit('shoot', { dirX: dirX / len, dirY: dirY / len });
});

socket.on('playerMoved', (p) => { if(players[p.id]) { players[p.id].x = p.x; players[p.id].y = p.y; } });
socket.on('updateBullets', (bList) => { bullets = bList; });
socket.on('updateAllPlayers', (pList) => { players = pList; updateLeaderboard(); });
socket.on('playerDisconnected', (id) => { delete players[id]; updateLeaderboard(); });
socket.on('errorMsg', (msg) => alert(msg));

function updateLeaderboard() {
    scoresDiv.innerHTML = '';
    let sorted = Object.values(players).sort((a,b) => b.kills - a.kills).slice(0, 5);
    sorted.forEach(p => {
        scoresDiv.innerHTML += `<div class="score-row"><span>${p.username}</span><span style="color:#00ffc8">${p.kills} Leş</span></div>`;
    });
}

let camX = 0, camY = 0;
function animate() {
    if (!players[socket.id] || !isGameActive) return;

    if (keys.w || keys.a || keys.s || keys.d) {
        socket.emit('playerMove', keys);
    }

    let me = players[socket.id];
    let targetCamX = me.x - canvas.width / 2;
    let targetCamY = me.y - canvas.height / 2;
    camX += (targetCamX - camX) * 0.08; 
    camY += (targetCamY - camY) * 0.08;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camX, -camY);

    ctx.strokeStyle = '#10101e'; ctx.lineWidth = 1;
    let startX = Math.floor(camX / 80) * 80;
    let startY = Math.floor(camY / 80) * 80;
    for (let x = Math.max(0, startX); x <= Math.min(currentMapSize, startX + canvas.width + 160); x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, currentMapSize); ctx.stroke();
    }
    for (let y = Math.max(0, startY); y <= Math.min(currentMapSize, startY + canvas.height + 160); y += 80) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(currentMapSize, y); ctx.stroke();
    }

    starParticles.forEach(star => {
        star.y += star.speed;
        if (star.y > currentMapSize) star.y = 0;
        ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 200, ${star.alpha})`; ctx.fill();
    });

    bullets.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4757'; ctx.fill(); ctx.closePath();
    });

    Object.keys(players).forEach(id => {
        let p = players[id];
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = id === socket.id ? '#00ffc8' : '#ffffff';
        ctx.stroke(); ctx.closePath();

        ctx.fillStyle = '#222'; ctx.fillRect(p.x - 25, p.y - 45, 50, 6);
        ctx.fillStyle = p.hp > 40 ? '#00ffc8' : '#ff4757';
        ctx.fillRect(p.x - 25, p.y - 45, (p.hp / 100) * 50, 6);

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
        ctx.fillText(p.username, p.x, p.y - 65);
    });

    ctx.restore();

    let miniSize = 150; 
    let miniX = canvas.width - miniSize - 20;
    let miniY = canvas.height - miniSize - 20;

    ctx.fillStyle = 'rgba(8, 8, 15, 0.8)'; ctx.fillRect(miniX, miniY, miniSize, miniSize);
    ctx.strokeStyle = '#00ffc8'; ctx.lineWidth = 2; ctx.strokeRect(miniX, miniY, miniSize, miniSize);

    Object.keys(players).forEach(id => {
        let p = players[id];
        let pMiniX = miniX + (p.x / currentMapSize) * miniSize;
        let pMiniY = miniY + (p.y / currentMapSize) * miniSize;

        ctx.beginPath(); ctx.arc(pMiniX, pMiniY, id === socket.id ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = id === socket.id ? '#00ffc8' : '#ff4757'; ctx.fill(); ctx.closePath();
    });

    requestAnimationFrame(animate);
}
