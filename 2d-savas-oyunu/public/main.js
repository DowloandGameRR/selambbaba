// Sunucu URL adresinizi buraya bağlayın
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

// Ekran DOM Yönetimleri
const loginScreen = document.getElementById('loginScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const chatWrapper = document.getElementById('chatWrapper');
const gameOverScreen = document.getElementById('gameOverScreen');
const settingsModal = document.getElementById('settingsModal');

// Butonlar ve Girdiler
const usernameInput = document.getElementById('usernameInput');
const newRoomName = document.getElementById('newRoomName');
const newRoomPass = document.getElementById('newRoomPass');
const createRoomBtn = document.getElementById('createRoomBtn');
const roomListContainer = document.getElementById('roomListContainer');
const playerList = document.getElementById('playerList');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const lobbyTitle = document.getElementById('lobbyTitle');
const winnerText = document.getElementById('winnerText');

// Ayarlar Elemanları
const settingsBtn = document.getElementById('settingsBtn');
const closeModal = document.querySelector('.close-modal');
const settingVolume = document.getElementById('settingVolume');
const settingColor = document.getElementById('settingColor');

// Global Değişkenler
let currentRoom = null;
let myId = null;
let players = {};
let bullets = [];
let keys = {};
let isMuted = false;
let mySelectedColor = '#00ffcc';

// Canvas Ayarları
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Local oyuncu geçici modeli
let localPlayer = { x: 200, y: 300, speed: 4 };

// --- GİRİŞ VE ODA AYARLARI ---
socket.on('connect', () => { myId = socket.id; });

setInterval(() => {
    if (loginScreen.className === 'container') socket.emit('getRooms');
}, 2000);

createRoomBtn.addEventListener('click', () => {
    const roomName = newRoomName.value.trim();
    const password = newRoomPass.value;
    if (!roomName) return alert('Lütfen geçerli bir oda adı girin!');
    socket.emit('createRoom', { roomName, password });
});

socket.on('roomCreated', (roomName) => {
    joinTheRoom(roomName, newRoomPass.value);
});

socket.on('roomList', (rooms) => {
    roomListContainer.innerHTML = '';
    if (rooms.length === 0) {
        roomListContainer.innerHTML = '<p class="empty-text">Aktif oda bulunamadı.</p>';
        return;
    }
    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room-item';
        div.innerHTML = `<span><b>${room.name}</b> (${room.players}/4) ${room.started ? '[Başladı]' : ''}</span>`;
        
        const btn = document.createElement('button');
        btn.innerText = 'Katıl';
        btn.className = 'btn btn-primary';
        btn.style.width = '70px';
        btn.style.padding = '5px';
        btn.onclick = () => {
            const pass = room.started ? '' : prompt('Eğer varsa oda şifresini girin:');
            joinTheRoom(room.name, pass);
        };
        div.appendChild(btn);
        roomListContainer.appendChild(div);
    });
});

function joinTheRoom(roomName, password) {
    const username = usernameInput.value.trim() || 'Savaşçı_' + Math.floor(Math.random()*1000);
    currentRoom = roomName;
    socket.emit('joinRoom', { roomName, password, username, color: mySelectedColor });
}

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
        div.style.borderTop = `4px solid ${p.color}`;
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

leaveRoomBtn.addEventListener('click', () => {
    location.reload();
});

// --- AYARLAR MENÜSÜ ETKİLEŞİMLERİ ---
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeModal.addEventListener('click', () => settingsModal.classList.add('hidden'));
window.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });

settingVolume.addEventListener('click', () => {
    isMuted = !isMuted;
    settingVolume.innerText = isMuted ? 'Kapalı (Unmute)' : 'Açık (Mute)';
    settingVolume.className = isMuted ? 'btn id-danger' : 'btn btn-secondary';
});

settingColor.addEventListener('click', () => {
    // Mobil ve anlık tıklama koruması için input değiştikçe tetikle:
    settingColor.onchange = (e) => {
        mySelectedColor = e.target.value;
        if (players[myId]) {
            players[myId].color = mySelectedColor;
        }
    };
});

// --- ENTER VE CHAT SİSTEMİ ---
const chatInput = document.getElementById('chatInput');
const chatBox = document.getElementById('chatBox');

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            const message = chatInput.value.trim();
            if (message) {
                socket.emit('chatMessage', message);
            }
            chatInput.value = '';
            chatInput.blur();
        } else {
            if (!chatWrapper.classList.contains('hidden')) {
                chatInput.focus();
            }
        }
    }
});

socket.on('newChatMessage', (data) => {
    const msgElement = document.createElement('div');
    msgElement.className = 'chat-msg';
    msgElement.innerHTML = `<span class="sender">${data.sender}:</span> ${data.msg}`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// --- OYUN MOTORU VE CANVAS DÖNGÜSÜ ---
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
    if (document.activeElement === chatInput) return; // Chat açıkken karakter yürümesin
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') {
        shootBullet();
    }
});
window.addEventListener('keyup', (e) => {
    if (document.activeElement === chatInput) return;
    keys[e.key.toLowerCase()] = false;
});

function shootBullet() {
    if (!players[myId] || players[myId].hp <= 0) return;
    
    // Ses efekti eklemek isterseniz buraya bağlayabilirsiniz (isMuted kontrolüyle)
    let angle = 0;
    if (keys['w'] || keys['arrowup']) angle = -Math.PI / 2;
    else if (keys['s'] || keys['arrowdown']) angle = Math.PI / 2;
    else if (keys['a'] || keys['arrowleft']) angle = Math.PI;
    else if (keys['d'] || keys['arrowright']) angle = 0;
    else angle = 0; // Varsayılan sağa doğru ateş

    const bulletData = {
        x: localPlayer.x,
        y: localPlayer.y,
        vx: Math.cos(angle) * 7,
        vy: Math.sin(angle) * 7
    };
    bullets.push({ ...bulletData, owner: myId });
    socket.emit('fireBullet', bulletData);
}

socket.on('bulletSpawned', (bData) => {
    bullets.push(bData);
});

socket.on('playerUpdated', (serverPlayer) => {
    if (players[serverPlayer.id]) {
        players[serverPlayer.id].x = serverPlayer.x;
        players[serverPlayer.id].y = serverPlayer.y;
    }
});

function update() {
    if (!players[myId] || players[myId].hp <= 0) return;

    let moved = false;
    if (keys['w'] || keys['arrowup']) { localPlayer.y -= localPlayer.speed; moved = true; }
    if (keys['s'] || keys['arrowdown']) { localPlayer.y += localPlayer.speed; moved = true; }
    if (keys['a'] || keys['arrowleft']) { localPlayer.x -= localPlayer.speed; moved = true; }
    if (keys['d'] || keys['arrowright']) { localPlayer.x += localPlayer.speed; moved = true; }

    // Sınırlar dışına taşma engeli
    if (localPlayer.x < 20) localPlayer.x = 20;
    if (localPlayer.x > canvas.width - 20) localPlayer.x = canvas.width - 20;
    if (localPlayer.y < 20) localPlayer.y = 20;
    if (localPlayer.y > canvas.height - 20) localPlayer.y = canvas.height - 20;

    if (moved) {
        players[myId].x = localPlayer.x;
        players[myId].y = localPlayer.y;
        socket.emit('playerMove', { x: localPlayer.x, y: localPlayer.y });
    }

    // Mermileri güncelle
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        // Kendi mermimizin başkasına çarpma kontrolü
        if (b.owner === myId) {
            Object.keys(players).forEach(pId => {
                if (pId !== myId && players[pId].hp > 0) {
                    let dist = Math.hypot(b.x - players[pId].x, b.y - players[pId].y);
                    if (dist < 25) { // Çarpma gerçekleşti
                        socket.emit('bulletHit', { targetId: pId });
                        bullets.splice(i, 1);
                        return;
                    }
                }
            });
        }

        // Harita dışına çıkan mermileri temizle
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Izgara Arka Planı Çizimi
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Oyuncuları Çiz
    const scoreList = [];
    Object.keys(players).forEach(id => {
        const p = players[id];
        scoreList.push(`${p.username}: ${p.score} Leş`);
        if (p.hp <= 0) return; // Ölü oyuncuyu çizme

        // Karakter Gövdesi (Neon Daire)
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset

        // Can Barı Arkası
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(p.x - 25, p.y - 35, 50, 6);
        // Gerçek Can Değeri
        ctx.fillStyle = '#00ff66';
        ctx.fillRect(p.x - 25, p.y - 35, (p.hp / 100) * 50, 6);

        // İsim Etiketi
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, p.x, p.y - 42);
    });

    // Skor Tahtasını Güncelle
    document.getElementById('scoreBoard').innerHTML = `<b>📊 SKOR TABLOSU</b><br>${scoreList.join('<br>')}`;

    // Mermileri Çiz
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffea00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffea00';
        ctx.fill();
        ctx.shadowBlur = 0;
    });
}

function animate() {
    if (gameScreen.classList.contains('hidden')) return;
    update();
    draw();
    requestAnimationFrame(animate);
}

// --- OYUN BİTTİ VE GERİ DÖNÜŞ DÖNGÜSÜ ---
socket.on('gameOver', (data) => {
    winnerText.innerText = `KAZANAN: ${data.winner.toUpperCase()}`;
    gameOverScreen.classList.remove('hidden');

    // 3 Saniye sonra otomatik lobi ekranına fırlatır
    setTimeout(() => {
        gameOverScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
    }, 3000);
});
