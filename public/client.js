/* ... Imports ... */
const socket = io();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 10, 50); // Soft fog

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- AUDIO MANAGER ---
class AudioManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        // Bind init to first interaction
        const initAudio = () => {
            if (!this.initialized) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.initialized = true;
                console.log("Audio Context Initialized");
                // Remove listeners
                document.removeEventListener('click', initAudio);
                document.removeEventListener('keydown', initAudio);
                document.removeEventListener('touchstart', initAudio);
            } else if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        };
        document.addEventListener('click', initAudio);
        document.addEventListener('keydown', initAudio);
        document.addEventListener('touchstart', initAudio);
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.initialized || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playAttack() {
        if (!this.initialized || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playHit() {
        this.playTone(100, 'square', 0.1, 0.2);
    }

    playLevelUp() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        [440, 554, 659, 880].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, now + i*0.1);
            gain.gain.linearRampToValueAtTime(0, now + i*0.1 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i*0.1);
            osc.stop(now + i*0.1 + 0.2);
        });
    }

    playCoin() {
        this.playTone(1200, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(1800, 'sine', 0.2, 0.1), 50);
    }
}
const audioManager = new AudioManager();
window.audioManager = audioManager;

// --- PARTICLE SYSTEM ---
class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
    }

    createHitEffect(x, z) {
        for(let i=0; i<8; i++) {
            const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const mat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 0.5, z);
            const vel = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*4, (Math.random()-0.5)*4);
            this.scene.add(mesh);
            this.particles.push({ mesh, vel, life: 1.0 });
        }
    }

    createLevelUpEffect(x, z) {
        for(let i=0; i<20; i++) {
            const geo = new THREE.PlaneGeometry(0.1, 0.1);
            const mat = new THREE.MeshBasicMaterial({ color: 0xFFD700, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x + (Math.random()-0.5), 0, z + (Math.random()-0.5));
            const vel = new THREE.Vector3(0, 1 + Math.random(), 0);
            this.scene.add(mesh);
            this.particles.push({ mesh, vel, life: 2.0, type: 'rise' });
        }
    }

    createWalkDust(x, z) {
        const geo = new THREE.PlaneGeometry(0.15, 0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI/2;
        mesh.position.set(x, 0.05, z);
        this.scene.add(mesh);
        this.particles.push({ mesh, vel: new THREE.Vector3(0,0,0), life: 0.5, type: 'fade' });
    }

    update(delta) {
        for(let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta;
            if(p.type === 'rise') {
                p.mesh.position.addScaledVector(p.vel, delta);
                p.mesh.rotation.y += delta;
            } else if(p.type === 'fade') {
                 p.mesh.scale.multiplyScalar(1.0 + delta);
                 p.mesh.material.opacity = p.life * 2;
            } else {
                p.vel.y -= 9.8 * delta;
                p.mesh.position.addScaledVector(p.vel, delta);
                p.mesh.rotation.x += delta * 5;
                if(p.mesh.position.y < 0) {
                     p.mesh.position.y = 0;
                     p.vel.y *= -0.5; p.vel.x *= 0.8; p.vel.z *= 0.8;
                }
            }
            if(p.life <= 0) {
                this.scene.remove(p.mesh);
                if(p.mesh.geometry) p.mesh.geometry.dispose();
                if(p.mesh.material) p.mesh.material.dispose();
                this.particles.splice(i, 1);
            }
        }
    }
}
const particleSystem = new ParticleSystem(scene);
window.particleSystem = particleSystem;

// --- LIGHTING & DAY/NIGHT ---
const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
scene.add(dirLight);

const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshLambertMaterial({ color: 0x57D066 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// Game State
const players = {};
const mobs = {};
const projectiles = {};
const lootBags = {};
const npcs = {};
let myId = null;
let myUserId = null;
let myUsername = null;
let myClass = null;
let myInventory = [];
let worldBlocks = [];
let gameStarted = false;

// Constants
const PLAYER_SPEED_PER_SEC = 4;

// Input State
const keys = { w: false, a: false, s: false, d: false, z: false, q: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false };

// UI Elements
const mainMenu = document.getElementById('main-menu');
const uiLayer = document.getElementById('ui-layer');
const loginForm = document.getElementById('login-form');
const createCharForm = document.getElementById('create-char-form');
const lobbyScreen = document.getElementById('lobby-screen');
const loginMsg = document.getElementById('login-msg');

const hpBar = document.getElementById('hp-bar');
const manaBar = document.getElementById('mana-bar');
const xpBar = document.getElementById('xp-bar');
const chatInput = document.getElementById('chat-input');
const chatLog = document.getElementById('chat-log');
const floatingTextContainer = document.getElementById('floating-text-container');
const joystickContainer = document.getElementById('joystick-container');
const joystickKnob = document.getElementById('joystick-knob');
const actionButton = document.getElementById('action-button');
const skillButton = document.getElementById('skill-button');
const deathScreen = document.getElementById('death-screen');
const inventoryContainer = document.getElementById('inventory-container');
const bagButton = document.getElementById('bag-button');
const itemTooltip = document.getElementById('item-tooltip');

const contextActionBtn = document.getElementById('context-action-btn');
const feedbackOverlay = document.getElementById('feedback-overlay');

// Variables for Menu State
let selectedClass = 'Guerrier';
let selectedColor = '#ffffff';
let isInventoryOpen = false;
let myGold = 0;
const cooldowns = { '1': 0, '2': 0 };

const ITEM_DEFS = {
    'rusty_sword': { name: 'Épée Rouillée', color: '#7f8c8d', stats: 'Dégâts: +5' },
    'leather_tunic': { name: 'Tunique en Cuir', color: '#d35400', stats: 'Armure: +5' },
    'health_potion': { name: 'Potion de Soin', color: '#e74c3c', stats: 'Soin: +20' }
};

// --- MENU LOGIC ---
document.getElementById('btn-login').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user && pass) {
        socket.emit('login', { username: user, password: pass });
        audioManager.playTone(400, 'sine', 0.1);
    }
});

document.getElementById('btn-register').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user && pass) socket.emit('register', { username: user, password: pass });
});

socket.on('loginError', (msg) => { loginMsg.textContent = msg; });
socket.on('registerError', (msg) => { loginMsg.textContent = msg; });
socket.on('registerSuccess', () => { loginMsg.textContent = "Registered! Please login."; loginMsg.style.color = '#2ecc71'; });

socket.on('loginSuccess', (data) => {
    myUserId = data.userId;
    myUsername = data.username;
    loginForm.style.display = 'none';
    if (data.hasCharacter) {
        lobbyScreen.style.display = 'flex';
        document.getElementById('welcome-text').textContent = `Welcome back, ${myUsername}`;
    } else {
        createCharForm.style.display = 'flex';
    }
});

const classCards = document.querySelectorAll('.class-card');
classCards.forEach(card => {
    card.addEventListener('click', () => {
        classCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedClass = card.dataset.class;
    });
});

document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('char-name').value;
    selectedColor = document.getElementById('char-color').value;
    if (name) {
        const data = { userId: myUserId, name: name, className: selectedClass, color: selectedColor };
        socket.emit('createCharacter', data);
    } else {
        alert("Please enter a character name.");
    }
});

socket.on('createCharacterError', (msg) => { alert('Error: ' + msg); });
socket.on('createCharacterSuccess', () => {
    createCharForm.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    document.getElementById('welcome-text').textContent = `Ready to play, ${myUsername}`;
});

document.getElementById('btn-play').addEventListener('click', () => { socket.emit('enterWorld', { userId: myUserId }); });
socket.on('enterWorldSuccess', (data) => {
    mainMenu.style.display = 'none';
    uiLayer.style.display = 'flex';
    gameStarted = true;
    myId = data.id;
    myClass = data.className;
    camera.rotation.set(0,0,0);
});

// --- GAME LOGIC ---
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };
let currentTargetId = null;
let targetRing = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function createMobMesh() {
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const material = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.4;
    return mesh;
}

function flashMob(mobId) {
    if (mobs[mobId] && mobs[mobId].mesh) {
        const mesh = mobs[mobId].mesh;
        mesh.material.emissive.setHex(0xFFFFFF);
        setTimeout(() => { if (mesh && mesh.material) mesh.material.emissive.setHex(0x000000); }, 100);
    }
}

function updateTargetRing() {
    if (!targetRing) {
        const geometry = new THREE.RingGeometry(0.6, 0.7, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xFF0000, side: THREE.DoubleSide });
        targetRing = new THREE.Mesh(geometry, material);
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.y = 0.05;

        // Add 3D Arrow
        const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8);
        const coneMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const arrow = new THREE.Mesh(coneGeo, coneMat);
        arrow.position.set(0, 0, 1.5); // Offset z relative to ring center? No, relative to mesh
        // Actually, let's just add it to scene and move it
        arrow.rotation.x = Math.PI; // Point down

        targetRing.userData = { arrow: arrow }; // Store reference
        scene.add(targetRing);
        scene.add(arrow);

        targetRing.visible = false;
        arrow.visible = false;
    }

    if (currentTargetId && mobs[currentTargetId]) {
        const mob = mobs[currentTargetId];
        targetRing.position.set(mob.mesh.position.x, 0.05, mob.mesh.position.z);
        targetRing.visible = true;

        const arrow = targetRing.userData.arrow;
        arrow.position.set(mob.mesh.position.x, mob.mesh.position.y + 1.2, mob.mesh.position.z);
        arrow.visible = true;
        // Bobbing animation
        arrow.position.y += Math.sin(Date.now() * 0.01) * 0.1;
    } else {
        targetRing.visible = false;
        targetRing.userData.arrow.visible = false;
        currentTargetId = null;
    }
}

function createFloatingText(text, x, z, isCrit = false) {
    const div = document.createElement('div');
    div.className = 'floating-text' + (isCrit ? ' crit' : '');
    div.textContent = text;
    floatingTextContainer.appendChild(div);
    const pos = new THREE.Vector3(x, 1.5, z);
    pos.project(camera);
    const xPos = (pos.x * .5 + .5) * window.innerWidth;
    const yPos = (-(pos.y * .5) + .5) * window.innerHeight;
    div.style.left = `${xPos}px`;
    div.style.top = `${yPos}px`;
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 1000);
}

function createPlayerMesh(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), new THREE.MeshLambertMaterial({ color: color, flatShading: true }));
    body.position.y = 0.5; body.castShadow = true; body.receiveShadow = true; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xffccaa, flatShading: true }));
    head.position.y = 1.25; head.castShadow = true; head.receiveShadow = true; group.add(head);
    const eyeGeo = new THREE.PlaneGeometry(0.1, 0.1); const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat); leftEye.position.set(-0.15, 1.3, 0.26); group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat); rightEye.position.set(0.15, 1.3, 0.26); group.add(rightEye);
    return group;
}

function generateWorld(blocks) {
    blocks.forEach(block => {
        const color = (block.height > 3) ? 0x6F7887 : (block.height > 1.5) ? 0x57D066 : 0x4FB4E6;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, block.height, 1), new THREE.MeshLambertMaterial({ color: color, flatShading: true }));
        mesh.position.set(block.x, block.height / 2, block.z);
        mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    });
}
socket.on('world', (blocks) => { worldBlocks = blocks; generateWorld(blocks); });

// State Sync
socket.on('state', (state) => {
    const serverPlayers = state.players || {};
    const serverMobs = state.mobs || {};
    const serverProjectiles = state.projectiles || [];
    const serverLoot = state.loot || {};
    const serverNPCs = state.npcs || {};

    // Players
    for (const id in serverPlayers) {
        const p = serverPlayers[id];
        if (gameStarted && id === myId) {
            updateStatsUI(p);
            handleDeathState(p.dead);
            if (p.inventory && JSON.stringify(myInventory) !== JSON.stringify(p.inventory)) {
                myInventory = p.inventory;
                if (isInventoryOpen) renderInventory();
            }
            if (p.gold !== undefined) {
                 if (p.gold > myGold) audioManager.playCoin();
                 myGold = p.gold;
            }
        }
        if (players[id]) updatePlayerVisuals(players[id], p.dead, p.color);
        if (!players[id]) {
            const mesh = createPlayerMesh(p.color);
            mesh.position.set(p.x, 0, p.z);
            scene.add(mesh);
            players[id] = { mesh: mesh, targetPosition: new THREE.Vector3(p.x, 0, p.z), originalColor: p.color };
        } else {
            players[id].targetPosition.set(p.x, 0, p.z);
            if (gameStarted && id === myId) {
                 const dist = players[id].mesh.position.distanceTo(new THREE.Vector3(p.x, 0, p.z));
                 if (dist > 2.0) players[id].mesh.position.set(p.x, 0, p.z);
            }
        }
    }
    for (const id in players) { if (!serverPlayers[id]) { scene.remove(players[id].mesh); delete players[id]; } }

    // Mobs
    for (const id in serverMobs) {
        const m = serverMobs[id];
        if (!mobs[id]) {
            const mesh = createMobMesh();
            mesh.position.set(m.x, 0.4, m.z);
            scene.add(mesh);
            mesh.userData = { id: id, type: 'mob' };
            mobs[id] = { mesh: mesh, hp: m.hp, maxHp: m.maxHp };
        } else {
            if (m.dead && !mobs[id].dead) {
                scene.remove(mobs[id].mesh);
                mobs[id].dead = true;
                if (currentTargetId === id) currentTargetId = null;
            } else if (!m.dead && mobs[id].dead) {
                scene.add(mobs[id].mesh);
                mobs[id].dead = false;
                mobs[id].mesh.position.set(m.x, 0.4, m.z);
            }
            mobs[id].hp = m.hp;
            if (!mobs[id].dead) mobs[id].mesh.position.lerp(new THREE.Vector3(m.x, 0.4, m.z), 0.1);
        }
    }

    // Projectiles
    const activeProjIds = new Set();
    for (const p of serverProjectiles) {
        activeProjIds.add(p.id);
        if (!projectiles[p.id]) {
            let mesh;
            if (p.name === 'Fireball') mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 8, 8), new THREE.MeshBasicMaterial({ color: p.color }));
            else if (p.name === 'Piercing Arrow') {
                mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), new THREE.MeshBasicMaterial({ color: p.color }));
                mesh.rotation.set(Math.PI/2, 0, 0);
            } else mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 8, 8), new THREE.MeshBasicMaterial({ color: p.color }));
            mesh.position.set(p.x, 0.5, p.z);
            if (p.name === 'Piercing Arrow') { mesh.lookAt(p.x + p.vx, 0.5, p.z + p.vz); mesh.rotateX(Math.PI / 2); }
            scene.add(mesh);
            projectiles[p.id] = mesh;
        } else projectiles[p.id].position.lerp(new THREE.Vector3(p.x, 0.5, p.z), 0.3);
    }
    for (const id in projectiles) { if (!activeProjIds.has(id)) { scene.remove(projectiles[id]); delete projectiles[id]; } }

    // Loot Bags
    const activeLootIds = new Set();
    for (const id in serverLoot) {
        const l = serverLoot[id];
        activeLootIds.add(id);
        if (!lootBags[id]) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
            mesh.position.set(l.x, 0.15, l.z);
            mesh.castShadow = true;
            mesh.userData = { id: id, type: 'loot' };
            scene.add(mesh);
            lootBags[id] = { mesh: mesh, itemId: l.itemId };
        }
    }
    for (const id in lootBags) { if (!activeLootIds.has(id)) { scene.remove(lootBags[id].mesh); delete lootBags[id]; } }

    // NPCs
    for (const id in serverNPCs) {
        const n = serverNPCs[id];
        if (!npcs[id]) {
            let geometry, color;
            if (n.type === 'Merchant') { geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8); color = 0xF1C40F; }
            else { geometry = new THREE.BoxGeometry(0.8, 1.5, 0.8); color = 0xFFFFFF; }
            const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: color }));
            mesh.position.set(n.x, 0.75, n.z);
            mesh.castShadow = true;
            mesh.userData = { id: id, type: 'npc' };
            scene.add(mesh);

            // 3D Sprite Icon
            const map = new THREE.TextureLoader().load(
                n.type === 'Merchant' ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' : // Placeholder Gold
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // Placeholder Blue
            );
            // Better to use CanvasTexture for dynamic icons without assets
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = n.type === 'Merchant' ? '#f1c40f' : '#3498db';
            ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'white'; ctx.font = '40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(n.type === 'Merchant' ? '$' : '?', 32, 32);

            const spriteMap = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: spriteMap });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(0, 1.2, 0);
            sprite.scale.set(0.5, 0.5, 0.5);
            mesh.add(sprite); // Add as child

            npcs[id] = { mesh: mesh, x: n.x, z: n.z, sprite: sprite };
        }
    }
});

socket.on('damage', (data) => {
    if (gameStarted) {
        createFloatingText(`-${data.amount}`, data.x, data.z);
        particleSystem.createHitEffect(data.x, data.z);
        audioManager.playHit();
        for (const id in mobs) {
             const m = mobs[id];
             if (Math.abs(m.mesh.position.x - data.x) < 0.5 && Math.abs(m.mesh.position.z - data.z) < 0.5) flashMob(id);
        }
    }
});

socket.on('effects', (events) => {
    if (!gameStarted) return;
    for (const event of events) {
        if (event.type === 'damage') createFloatingText(`-${event.amount}`, event.x, event.z);
        else if (event.type === 'effect') {
            if (event.name === 'whirlwind') createWhirlwindEffect(event.x, event.z, event.radius);
            else if (event.name === 'explosion') createExplosionEffect(event.x, event.z);
            else if (event.name === 'hit') { particleSystem.createHitEffect(event.x, event.z); audioManager.playHit(); }
        } else if (event.type === 'damage_text') createFloatingText(`-${event.amount}`, event.x, event.z);
    }
});

function createWhirlwindEffect(x, z, radius) {
    const geometry = new THREE.TorusGeometry(radius, 0.2, 8, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.5, z);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);
    let scale = 0.1;
    const animateEffect = () => {
        scale += 0.1; mesh.scale.set(scale, scale, scale); mesh.material.opacity -= 0.05;
        if (mesh.material.opacity > 0) requestAnimationFrame(animateEffect);
        else { scene.remove(mesh); geometry.dispose(); material.dispose(); }
    }; animateEffect();
}

function createExplosionEffect(x, z) {
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xFF4500, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);
    let scale = 1.0;
    const animateEffect = () => {
        scale += 0.2; mesh.scale.set(scale, scale, scale); mesh.material.opacity -= 0.1;
        if (mesh.material.opacity > 0) requestAnimationFrame(animateEffect);
        else { scene.remove(mesh); geometry.dispose(); material.dispose(); }
    }; animateEffect();
}

socket.on('chatMessage', (data) => {
    if (!gameStarted) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.textContent = `${data.id.substring(0, 5)}: ${data.text}`;
    chatLog.appendChild(msgDiv);
    if (data.id === 'System' && data.text.includes('Level Up')) {
        audioManager.playLevelUp();
        if (players[myId]) { const pos = players[myId].mesh.position; particleSystem.createLevelUpEffect(pos.x, pos.z); }
    }
    setTimeout(() => { msgDiv.classList.add('fade-out'); setTimeout(() => { if (msgDiv.parentNode) msgDiv.parentNode.removeChild(msgDiv); }, 1000); }, 10000);
});

// Visual Update Helpers
function handleDeathState(dead) {
    if (dead && !isDead) { isDead = true; deathScreen.style.display = 'flex'; }
    else if (!dead && isDead) { isDead = false; deathScreen.style.display = 'none'; }
}
let isDead = false;

function updatePlayerVisuals(playerObj, isDead, originalColor) {
    const mesh = playerObj.mesh; if (!mesh) return;
    if (isDead) {
        if (mesh.rotation.z !== Math.PI / 2) {
            mesh.rotation.z = Math.PI / 2;
            mesh.traverse(child => { if (child.isMesh) child.material.color.setHex(0x555555); });
        }
    } else {
        if (mesh.rotation.z !== 0) {
            mesh.rotation.z = 0;
            if (mesh.children[0]) mesh.children[0].material.color.setHex(originalColor);
            if (mesh.children[1]) mesh.children[1].material.color.setHex(0xffccaa);
            if (mesh.children[2]) mesh.children[2].material.color.setHex(0x000000);
            if (mesh.children[3]) mesh.children[3].material.color.setHex(0x000000);
        }
    }
}

function updateStatsUI(player) {
    if (!player) return;
    if (hpBar) hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    if (manaBar) manaBar.style.width = `${(player.mana / player.maxMana) * 100}%`;
    if (xpBar) xpBar.style.width = `${(player.xp / player.maxXp) * 100}%`;
}

// Input & Render Loop
window.addEventListener('keydown', (e) => {
    if (!gameStarted) return;
    if (e.key.toLowerCase() === 'i') toggleInventory();
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            const text = chatInput.value.trim();
            if (text.length > 0) socket.emit('chatMessage', text);
            chatInput.value = ''; chatInput.blur();
        } else { e.preventDefault(); chatInput.focus(); }
        return;
    }
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) keys[e.key] = true;

    // Combat
    if (e.key === '1') {
        performAttack();
    }

    // Skill
    if (e.key === '2') {
        performSkill();
    }
});

window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) keys[e.key] = false; });

// Touch Inputs
joystickContainer.addEventListener('touchstart', (e) => { e.preventDefault(); joystickActive = true; updateJoystick(e.changedTouches[0]); }, { passive: false });
joystickContainer.addEventListener('touchmove', (e) => { e.preventDefault(); if (joystickActive) updateJoystick(e.changedTouches[0]); }, { passive: false });
joystickContainer.addEventListener('touchend', (e) => { e.preventDefault(); joystickActive = false; joystickVector = { x: 0, y: 0 }; resetJoystickUI(); });

function updateJoystick(touch) {
    if (isInventoryOpen) return;
    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2; const centerY = rect.height / 2;
    const x = touch.clientX - rect.left; const y = touch.clientY - rect.top;
    let dx = x - centerX; let dy = y - centerY;
    const maxDist = (rect.width / 2) - 25;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickVector.x = dx / maxDist; joystickVector.y = dy / maxDist;
}
function resetJoystickUI() { joystickKnob.style.transform = `translate(-50%, -50%)`; }

actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) {
        performAttack();
        actionButton.style.transform = "scale(0.9)";
    }
}, { passive: false });
actionButton.addEventListener('touchend', (e) => { e.preventDefault(); actionButton.style.transform = "scale(1)"; });

skillButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) {
        performSkill();
        skillButton.style.transform = "scale(0.9)";
    }
}, { passive: false });
skillButton.addEventListener('touchend', (e) => { e.preventDefault(); skillButton.style.transform = "scale(1)"; });

// --- SMART TARGETING ---
function performAttack() {
    if (!currentTargetId || !mobs[currentTargetId] || mobs[currentTargetId].dead) {
        autoTarget();
    }
    if (currentTargetId) {
        socket.emit('attack', currentTargetId);
        audioManager.playAttack();
    } else {
        // No target feedback
        feedbackOverlay.classList.remove('feedback-show');
        void feedbackOverlay.offsetWidth; // Trigger reflow
        feedbackOverlay.classList.add('feedback-show');
    }
}

function performSkill() {
    const cd = (myClass === 'Mage') ? 3000 : (myClass === 'Ranger') ? 5000 : 4000;
    if (Date.now() < cooldowns['2']) return;

    let dx = 0, dz = 1;
    if (currentTargetId && mobs[currentTargetId]) {
         // Aim at target
         const pPos = players[myId].mesh.position;
         const tPos = mobs[currentTargetId].mesh.position;
         dx = tPos.x - pPos.x;
         dz = tPos.z - pPos.z;
         const len = Math.sqrt(dx*dx + dz*dz);
         dx /= len; dz /= len;
         // Rotate player to face target?
         players[myId].mesh.rotation.y = Math.atan2(dx, dz);
    } else if (players[myId]) {
         const rot = players[myId].mesh.rotation.y;
         dx = Math.sin(rot); dz = Math.cos(rot);
    }

    socket.emit('skill', { dx, dz });
    audioManager.playTone(300, 'sawtooth', 0.3);
    cooldowns['2'] = Date.now() + cd;
    triggerCooldown('2', cd);
}

function autoTarget() {
    if (!myId || !players[myId]) return;
    const myPos = players[myId].mesh.position;
    // Get direction player is facing (from rotation) or camera?
    // "direction du regard du joueur" - usually mesh rotation or input direction.
    // Let's use mesh rotation for consistency.
    const lookDir = new THREE.Vector3(Math.sin(players[myId].mesh.rotation.y), 0, Math.cos(players[myId].mesh.rotation.y));

    let bestTarget = null;
    let minDist = 12; // Max Range

    for (const id in mobs) {
        const m = mobs[id];
        if (m.dead || !m.mesh) continue;

        const mobPos = m.mesh.position;
        const dist = myPos.distanceTo(mobPos);

        if (dist < minDist) {
            // FOV Check
            const toMob = new THREE.Vector3().subVectors(mobPos, myPos).normalize();
            const dot = lookDir.dot(toMob);

            if (dot > 0.5) { // Roughly 60 degree cone
                minDist = dist;
                bestTarget = id;
            }
        }
    }

    if (bestTarget) {
        currentTargetId = bestTarget;
        updateTargetRing();
    }
}

// --- CONTEXTUAL INTERACTION ---
function checkForInteractions() {
    if (!myId || !players[myId]) return;
    const myPos = players[myId].mesh.position;
    let nearest = null;
    let minDist = 2.5;
    let type = null; // 'npc' or 'loot'

    // Check NPCs
    for(const id in npcs) {
        const n = npcs[id];
        const d = myPos.distanceTo(new THREE.Vector3(n.x, 0, n.z));
        if (d < minDist) {
            minDist = d;
            nearest = id;
            type = 'npc';
        }
        // Bob sprite
        if (n.sprite) n.sprite.position.y = 1.2 + Math.sin(Date.now() * 0.005) * 0.1;
    }

    // Check Loot
    for(const id in lootBags) {
        const l = lootBags[id];
        const d = myPos.distanceTo(l.mesh.position);
        if (d < minDist) {
            minDist = d;
            nearest = id;
            type = 'loot';
        }
    }

    if (nearest) {
        contextActionBtn.style.display = 'flex';
        // Remove old listeners
        const newBtn = contextActionBtn.cloneNode(true);
        contextActionBtn.parentNode.replaceChild(newBtn, contextActionBtn);
        // We need to re-assign contextActionBtn to new node or just update onclick handler.
        // Cloning removes listeners.
        // Re-query
        const btn = document.getElementById('context-action-btn');

        if (type === 'npc') {
            btn.style.backgroundColor = '#f1c40f'; // Gold
            btn.textContent = '💬'; // Icon
            btn.onclick = () => socket.emit('interact', nearest);
            btn.ontouchstart = (e) => { e.preventDefault(); socket.emit('interact', nearest); };
        } else {
            btn.style.backgroundColor = '#e67e22'; // Orange
            btn.textContent = '✋'; // Hand
            btn.onclick = () => socket.emit('pickup', nearest);
            btn.ontouchstart = (e) => { e.preventDefault(); socket.emit('pickup', nearest); };
        }
    } else {
        document.getElementById('context-action-btn').style.display = 'none';
    }
}

function triggerCooldown(slot, durationMs) {
    const overlay = document.getElementById(`cd-${slot}`);
    if (overlay) {
        overlay.style.transition = 'none'; overlay.style.height = '100%';
        void overlay.offsetWidth;
        overlay.style.transition = `height ${durationMs}ms linear`; overlay.style.height = '0%';
    }
}

document.getElementById('bag-button').addEventListener('click', toggleInventory);
document.getElementById('shop-close')?.addEventListener('click', () => { document.getElementById('shop-container').style.display = 'none'; isShopOpen = false; });
document.getElementById('btn-close-quest')?.addEventListener('click', () => { document.getElementById('quest-dialog').style.display = 'none'; isQuestOpen = false; });

function toggleInventory() {
    isInventoryOpen = !isInventoryOpen;
    document.getElementById('inventory-container').style.display = isInventoryOpen ? 'flex' : 'none';
    if (isInventoryOpen) renderInventory();
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    const tooltip = document.getElementById('item-tooltip');
    grid.innerHTML = ''; // Clear existing

    // Add Gold Display
    if (!document.getElementById('gold-display')) {
        const goldDisplay = document.createElement('div');
        goldDisplay.id = 'gold-display';
        goldDisplay.style.color = '#f1c40f'; goldDisplay.style.marginBottom = '5px';
        goldDisplay.textContent = `Gold: ${myGold}`;
        inventoryContainer.insertBefore(goldDisplay, grid);
    } else { document.getElementById('gold-display').textContent = `Gold: ${myGold}`; }

    // Close button if needed (handled by toggle)

    for (let i=0; i<16; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        grid.appendChild(slot);

        const item = myInventory[i];
        if (item) {
             const def = ITEM_DEFS[item.itemId] || { name: item.itemId, color: '#ccc', stats: '' };
             const icon = document.createElement('div');
             icon.className = 'inv-item-icon';
             icon.style.backgroundColor = def.color;
             slot.appendChild(icon);
             if (item.equipped) slot.classList.add('equipped');

             slot.onclick = () => socket.emit('useItem', i);

             // Tooltip Logic
             slot.onmouseenter = () => {
                 tooltip.style.display = 'block';
                 tooltip.innerHTML = `<strong>${def.name}</strong>${item.equipped ? ' (Equipped)' : ''}<br><span style='color:yellow'>${def.stats || ''}</span>`;
             };
             slot.onmousemove = (e) => {
                 const rect = slot.getBoundingClientRect();
                 tooltip.style.left = (e.pageX + 10) + 'px';
                 tooltip.style.top = (e.pageY + 10) + 'px';
             };
             slot.onmouseleave = () => { tooltip.style.display = 'none'; };
        }
    }
}

// Window Close Logic for modals
window.addEventListener('click', (e) => {
    if (isInventoryOpen && !e.target.closest('#inventory-container') && !e.target.closest('#bag-button')) toggleInventory();
});

// Targeting & Click
window.addEventListener('click', (event) => {
    if (!gameStarted) return;
    if (event.target.closest('#ui-layer')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const objects = [];
    for (const id in mobs) { if (mobs[id].mesh && !mobs[id].dead) objects.push(mobs[id].mesh); }
    const intersects = raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData.type === 'mob') {
            currentTargetId = hit.userData.id;
            updateTargetRing();
        }
    } else {
        currentTargetId = null;
        updateTargetRing();
    }
});

function getLocalInput() {
    if (document.activeElement === chatInput) return { x: 0, z: 0 };
    if (isInventoryOpen) return { x: 0, z: 0 };
    let x = 0; let z = 0;
    if (keys['w'] || keys['z'] || keys['ArrowUp']) z -= 1;
    if (keys['s'] || keys['ArrowDown']) z += 1;
    if (keys['a'] || keys['q'] || keys['ArrowLeft']) x -= 1;
    if (keys['d'] || keys['ArrowRight']) x += 1;
    if (joystickActive) { x = joystickVector.x; z = joystickVector.y; }
    return { x, z };
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (!gameStarted) {
        const speed = 0.5; const radius = 15; const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time * speed) * radius;
        camera.position.z = Math.sin(time * speed) * radius;
        camera.position.y = 8; camera.lookAt(0, 0, 0);
    } else {
        particleSystem.update(delta);

        // Day/Night
        const time = Date.now() * 0.0001;
        dirLight.position.set(Math.sin(time) * 20, Math.abs(Math.cos(time)) * 20 + 5, Math.cos(time) * 20);
        dirLight.intensity = Math.max(0.2, (Math.abs(Math.cos(time)) * 20 + 5) / 25);

        // Interactions
        checkForInteractions();

        if (myId && players[myId]) {
            const input = getLocalInput();
            if ((input.x !== 0 || input.z !== 0) && !isDead) {
                const len = Math.sqrt(input.x*input.x + input.z*input.z);
                const dx = (input.x / len); const dz = (input.z / len);
                socket.emit('move', { x: dx, z: dz });
                const moveDistance = PLAYER_SPEED_PER_SEC * delta;
                const myMesh = players[myId].mesh;
                myMesh.position.x += dx * moveDistance; myMesh.position.z += dz * moveDistance;
                myMesh.rotation.y = Math.atan2(dx, dz);

                // Dust
                 if (Math.random() < 0.1) particleSystem.createWalkDust(myMesh.position.x, myMesh.position.z);
            }
            const myMesh = players[myId].mesh;
            const cameraOffset = new THREE.Vector3(0, 5, 8);
            camera.position.lerp(myMesh.position.clone().add(cameraOffset), 0.05);
            camera.lookAt(myMesh.position);
        }
        if (currentTargetId) updateTargetRing();
    }

    for (const id in players) {
        if (id === myId) continue;
        const player = players[id];
        if (player.mesh && player.targetPosition) {
            player.mesh.position.lerp(player.targetPosition, 0.1);
            const dx = player.targetPosition.x - player.mesh.position.x;
            const dz = player.targetPosition.z - player.mesh.position.z;
            if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) player.mesh.rotation.y = Math.atan2(dx, dz);
        }
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
