const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

// Ekran Görünüm Yönetimleri
const nameScreen = document.getElementById('nameScreen');
const loginScreen = document.getElementById('loginScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const chatWrapper = document.getElementById('chatWrapper');
const gameOverScreen = document.getElementById('gameOverScreen');
const settingsModal = document.getElementById('settingsModal');

// Elementler
const usernameInput = document.getElementById('usernameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const newRoomName = document.getElementById('newRoomName');
const newRoomPass = document.getElementById('newRoomPass');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomListContainer = document.getElementById('roomListContainer');
const playerList = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const lobbyTitle = document.getElementById('lobbyTitle');
const winnerText = document.getElementById('winnerText');

// Ayarlar
const settingsBtn = document.getElementById('settingsBtn');
const closeModal = document.querySelector('.close-modal');
const settingVolume = document.getElementById('settingVolume');
const settingColor = document.getElementById('settingColor');

// Değişkenler
let myUsername = "";
let currentRoom = null;
let myId = null;
let players = {};
let bullets = [];
let keys = {};
let isMuted = false;
let mySelectedColor = '#00ffcc';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let localPlayer = { x: 200, y: 300, speed: 4 };

socket.on('connect', () => { myId = socket.id; });

// --- 1. ADIM: İSİM GİRİŞ KONTROLÜ ---
saveNameBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) {
        alert('Oyuna girmek için bir kullanıcı adı yazmalısınız!');
        return;
    }
    myUsername = name;
    nameScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    
    // İsmi onayladıktan sonra lobi listesini çekmeye başla
    socket.emit('getRooms');
    setInterval(() => {
        if (!loginScreen.classList.contains('hidden')) socket.emit('getRooms');
    }, 2000);
});

// --- 2. ADIM: ODA YÖNETİMİ ---
createRoomBtn.addEventListener('click', () => {
    const roomName = newRoomName.value.trim();
    const password = newRoomPass.value;
    if (!roomName) return alert('Lütfen bir oda adı girin!');
    socket.emit('createRoom', { roomName, password });
});

socket.on('roomCreated', (data) => {
    // Kurulan odaya otomatik bağlan
    currentRoom = data.roomName;
    socket.emit('joinRoom', { roomName: data.roomName, password: data.password, username: myUsername, color: mySelectedColor });
});

function joinTheRoom(roomName, password) {
    currentRoom = roomName;
    socket.emit('joinRoom', { roomName, password, username: myUsername, color: mySelectedColor });
}

socket.on('roomList', (rooms) => {
    roomListContainer.innerHTML = '';
    if (rooms.length === 0) {
        roomListContainer.innerHTML = '<p class="empty-text">Aktif oda bulunamadı.</p>';
        return;
    }
    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room-item';
        div.innerHTML = `<span><b>${room.name}</b> (${room.players}/4) ${room.hasPassword ? '🔒' : ''}</span>`;
        
        const btn = document.createElement('button');
        btn.innerText = room.started ? 'İzle' : 'Katıl';
        btn.className = 'btn btn-primary';
        btn.style.width = '75px';
        btn.style.padding = '4px';
        btn.onclick = () => {
            let pass = "";
            if (room.hasPassword && !room.started) {
                pass = prompt('Oda şifresini giriniz:');
                if (pass === null) return;
            }
            joinTheRoom(room.name, pass);
        };
        div.appendChild(btn);
        roomListContainer.appendChild(div);
    });
});

socket.on('roomData', (serverPlayers) => {
    loginScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    chatWrapper.classList.remove('hidden');
    lobbyTitle.innerText = `ODA: ${currentRoom}`;
    
    playerList.innerHTML = '';
    players = {};
    
    serverPlayers.forEach(p => {
        players[p.id] = p;
        const div = document.createElement('div');
        div.className = 'player-card';
        div.style.borderLeft = `4px solid ${p.color}`;
        div.innerText = `${p.username} ${p.id === myId ? '(Sen)' : ''}`;
        playerList.appendChild(div);
    });

    if (serverPlayers[0] && serverPlayers[0].id === myId) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
});

socket.on('errorMsg', (msg) => alert(msg));
leaveRoomBtn.addEventListener('click', () => { location.reload(); });

// --- 3. ADIM: CHAT SİSTEMİ ---
const chatInput = document.getElementById('chatInput');
const chatBox = document.getElementById('chatBox');

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            const message = chatInput.value.trim();
            if (message) socket.emit('chatMessage', message);
            chatInput.value = '';
            chatInput.blur();
        } else {
            if (!chatWrapper.classList.contains('hidden')) chatInput.focus();
        }
    }
});

socket.on('newChatMessage', (data) => {
    const msgElement = document.createElement('div');
    msgElement.innerHTML = `<span class="sender">${data.sender}:</span> ${data.msg}`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// --- 4. ADIM: AYARLAR PANELİ ---
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeModal.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingVolume.addEventListener('click', () => {
    isMuted = !isMuted;
    settingVolume.innerText = isMuted ? 'Kapalı (Unmute)' : 'Açık (Mute)';
    settingVolume.className = isMuted ? 'btn btn-danger' : 'btn btn-secondary';
});
settingColor.addEventListener('change', (e) => {
    mySelectedColor = e.target.value;
    if (players[myId]) players[myId].color = mySelectedColor;
});

// --- 5. ADIM: OYUN DÖNGÜSÜ VE MEKANİKLER ---
startGameBtn.addEventListener('click', () => socket.emit('startGame'));

socket.on('gameStarted', () => {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    if (players[myId]) {
        localPlayer.x = players[myId].x;
        localPlayer.y = players[myId].y;
    }
    bullets = [];
    animate();
});

window.addEventListener('keydown', (e) => {
    if (document.activeElement === chatInput) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') shootBullet();
});
window.addEventListener('keyup', (e) => {
    if (document.activeElement === chatInput) return;
    keys[e.key.toLowerCase()] = false;
});

function shootBullet() {
    if (!players[myId] || players[myId].hp <= 0) return;
    
    let angle = 0;
    if (keys['w'] || keys['arrowup']) angle = -Math.PI / 2;
    else if (keys['s'] || keys['arrowdown']) angle = Math.PI / 2;
    else if (keys['a'] || keys['arrowleft']) angle = Math.PI;
    else if (keys['d'] || keys['arrowright']) angle = 0;
    else angle = 0;

    const bulletData = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: Math.cos(angle) * 8,
        vy: Math.sin(angle) * 8
    };
    bullets.push({ ...bulletData, owner: myId });
    socket.emit('fireBullet', bulletData);
}

socket.on('bulletSpawned', (bData) => { bullets.push(bData); });
socket.on('playerUpdated', (sPlayer) => {
    if (players[sPlayer.id]) {
        players[sPlayer.id].x = sPlayer.x;
        players[sPlayer.id].y = sPlayer.y;
    }
});

function update() {
    if (!players[myId] || players[myId].hp <= 0) return;

    let moved = false;
    if (keys['w'] || keys['arrowup']) { localPlayer.y -= localPlayer.speed; moved = true; }
    if (keys['s'] || keys['arrowdown']) { localPlayer.y += localPlayer.speed; moved = true; }
    if (keys['a'] || keys['arrowleft']) { localPlayer.x -= localPlayer.speed; moved = true; }
    if (keys['d'] || keys['arrowright']) { localPlayer.x += localPlayer.speed; moved = true; }

    if (localPlayer.x < 20) localPlayer.x = 20;
    if (localPlayer.x > canvas.width - 20) localPlayer.x = canvas.width - 20;
    if (localPlayer.y < 20) localPlayer.y = 20;
    if (localPlayer.y > canvas.height - 20) localPlayer.y = canvas.height - 20;

    if (moved) {
        players[myId].x = localPlayer.x;
        players[myId].y = localPlayer.y;
        socket.emit('playerMove', { x: localPlayer.x, y: localPlayer.y });
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        if (b.owner === myId) {
            Object.keys(players).forEach(pId => {
                if (pId !== myId && players[pId].hp > 0) {
                    let dist = Math.hypot(b.x - players[pId].x, b.y - players[pId].y);
                    if (dist < 22) {
                        socket.emit('bulletHit', { targetId: pId });
                        bullets.splice(i, 1);
                        return;
                    }
                }
            });
        }

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sade Arka Plan Izgarası
    ctx.strokeStyle = '#161625';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const scoreList = [];
    Object.keys(players).forEach(id => {
        const p = players[id];
        scoreList.push(`${p.username}: ${p.score} Kills`);
        if (p.hp <= 0) return;

        // Karakter (Mat Daire)
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Can Barı Göstergesi
        ctx.fillStyle = '#441122';
        ctx.fillRect(p.x - 22, p.y - 30, 44, 5);
        ctx.fillStyle = '#00aa55';
        ctx.fillRect(p.x - 22, p.y - 30, (p.hp / 100) * 44, 5);

        // İsimlik
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, p.x, p.y - 36);
    });

    document.getElementById('scoreBoard').innerHTML = `<b>📊 SKOR TABLOSU</b><br>${scoreList.join('<br>')}`;

    // Mermiler
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcc00';
        ctx.fill();
    });
}

function animate() {
    if (gameScreen.classList.contains('hidden')) return;
    update();
    draw();
    requestAnimationFrame(animate);
}

// --- 6. ADIM: MAÇ BİTİŞİ VE OTOMATİK LOBİYE DÖNÜŞ ---
socket.on('gameOver', (data) => {
    winnerText.innerText = `KAZANAN: ${data.winner.toUpperCase()}`;
    gameOverScreen.classList.remove('hidden');

    setTimeout(() => {
        gameOverScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
    }, 3000);
});
