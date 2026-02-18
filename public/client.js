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
        // Swoosh: fast slide
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
        // Thud/Crunch: low noise/square
        this.playTone(100, 'square', 0.1, 0.2);
    }

    playLevelUp() {
        // Ascending arpeggio
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
        // Ping
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
        // Exploding red cubes
        for(let i=0; i<8; i++) {
            const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const mat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 0.5, z);
            // Random velocity
            const vel = new THREE.Vector3(
                (Math.random()-0.5)*4,
                Math.random()*4,
                (Math.random()-0.5)*4
            );
            this.scene.add(mesh);
            this.particles.push({ mesh, vel, life: 1.0 });
        }
    }

    createLevelUpEffect(x, z) {
        // Rising golden pillar particles
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
        // Small puff
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
                // Physics particle
                p.vel.y -= 9.8 * delta; // Gravity
                p.mesh.position.addScaledVector(p.vel, delta);
                p.mesh.rotation.x += delta * 5;
                if(p.mesh.position.y < 0) {
                     p.mesh.position.y = 0;
                     p.vel.y *= -0.5; // Bounce
                     p.vel.x *= 0.8;
                     p.vel.z *= 0.8;
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
const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6); // Lowered base intensity
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

// Ground (Visual only for now, collision is handled by blocks)
const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshLambertMaterial({ color: 0x57D066 }); // Grass
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// Game State
const players = {};
const mobs = {};
const projectiles = {};
const lootBags = {};
const npcs = {}; // { id: { mesh, label } }
let myId = null;
let myUserId = null;
let myUsername = null;
let myClass = null;
let myInventory = [];
let worldBlocks = [];
let gameStarted = false; // State: Menu vs Game

// Constants
const PLAYER_SPEED_PER_SEC = 4;

// Input State
const keys = {
    w: false, a: false, s: false, d: false,
    z: false, q: false, // AZERTY support
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

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
const actionBar = document.getElementById('action-bar-container');
const floatingTextContainer = document.getElementById('floating-text-container');
const joystickContainer = document.getElementById('joystick-container');
const joystickKnob = document.getElementById('joystick-knob');
const actionButton = document.getElementById('action-button');
const skillButton = document.getElementById('skill-button');
const deathScreen = document.getElementById('death-screen');
const inventoryContainer = document.getElementById('inventory-container');
const bagButton = document.getElementById('bag-button');
const itemTooltip = document.getElementById('item-tooltip');

// Variables for Menu State
let selectedClass = 'Guerrier';
let selectedColor = '#ffffff';

// Inventory State
let isInventoryOpen = false;
let myGold = 0; // Added missing var

// Cooldown State
const cooldowns = {
    '1': 0,
    '2': 0
};

// Item Definitions
const ITEM_DEFS = {
    'rusty_sword': { name: 'Épée Rouillée', color: '#7f8c8d', stats: 'Dégâts: +5' },
    'leather_tunic': { name: 'Tunique en Cuir', color: '#d35400', stats: 'Armure: +5' },
    'health_potion': { name: 'Potion de Soin', color: '#e74c3c', stats: 'Soin: +20' }
};

// --- MENU LOGIC ---

// Login
document.getElementById('btn-login').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user && pass) {
        socket.emit('login', { username: user, password: pass });
        audioManager.playTone(400, 'sine', 0.1); // Feedback
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

// Character Creation
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

socket.on('createCharacterError', (msg) => {
    alert('Error: ' + msg);
});

socket.on('createCharacterSuccess', () => {
    createCharForm.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    document.getElementById('welcome-text').textContent = `Ready to play, ${myUsername}`;
});

// Enter World
document.getElementById('btn-play').addEventListener('click', () => {
    socket.emit('enterWorld', { userId: myUserId });
});

socket.on('enterWorldSuccess', (data) => {
    mainMenu.style.display = 'none';
    uiLayer.style.display = 'flex';
    gameStarted = true;
    myId = data.id;
    myClass = data.className;

    // Setup camera for game
    camera.rotation.set(0,0,0);
});


// --- GAME LOGIC ---

// Joystick State
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };

// Raycaster for targeting
let currentTargetId = null;
let targetRing = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Functions (Mob Mesh, Player Mesh, Floating Text, World Gen)

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
        const originalColor = mesh.material.color.getHex();
        mesh.material.emissive.setHex(0xFFFFFF);
        setTimeout(() => {
            if (mesh && mesh.material) mesh.material.emissive.setHex(0x000000);
        }, 100);
    }
}

function updateTargetRing() {
    if (!targetRing) {
        const geometry = new THREE.RingGeometry(0.6, 0.7, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xFF0000, side: THREE.DoubleSide });
        targetRing = new THREE.Mesh(geometry, material);
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.y = 0.05;
        scene.add(targetRing);
        targetRing.visible = false;
    }

    if (currentTargetId && mobs[currentTargetId]) {
        const mob = mobs[currentTargetId];
        targetRing.position.x = mob.mesh.position.x;
        targetRing.position.z = mob.mesh.position.z;
        targetRing.visible = true;
    } else {
        targetRing.visible = false;
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
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.8, 1, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa, flatShading: true });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.25;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    // Eyes
    const eyeGeo = new THREE.PlaneGeometry(0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.15, 1.3, 0.26);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.15, 1.3, 0.26);
    group.add(rightEye);
    return group;
}

function getBlockColor(height) {
    if (height > 3) return 0x6F7887;
    if (height > 1.5) return 0x57D066;
    return 0x4FB4E6;
}

function generateWorld(blocks) {
    blocks.forEach(block => {
        const geometry = new THREE.BoxGeometry(1, block.height, 1);
        const color = getBlockColor(block.height);
        const material = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(block.x, block.height / 2, block.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
    });
}

socket.on('world', (blocks) => {
    worldBlocks = blocks;
    generateWorld(blocks);
});

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

        // Update UI for me ONLY if game started
        if (gameStarted && id === myId) {
            updateStatsUI(p);
            handleDeathState(p.dead);

            // Sync Inventory
            if (p.inventory) {
                if (JSON.stringify(myInventory) !== JSON.stringify(p.inventory)) {
                    myInventory = p.inventory;
                    if (isInventoryOpen) renderInventory();
                }
            }
            // Sync Gold if available
            if (p.gold !== undefined) {
                 if (p.gold > myGold) audioManager.playCoin();
                 myGold = p.gold;
            }
        }

        // Update Visuals for Everyone
        if (players[id]) {
             updatePlayerVisuals(players[id], p.dead, p.color);
        }

        if (!players[id]) {
            // Create
            const mesh = createPlayerMesh(p.color);
            mesh.position.set(p.x, 0, p.z);
            scene.add(mesh);
            players[id] = {
                mesh: mesh,
                targetPosition: new THREE.Vector3(p.x, 0, p.z),
                originalColor: p.color
            };
        } else {
            // Update
            players[id].targetPosition.set(p.x, 0, p.z);

            // Reconciliation
            if (gameStarted && id === myId) {
                 const dist = players[id].mesh.position.distanceTo(new THREE.Vector3(p.x, 0, p.z));
                 if (dist > 2.0) {
                     players[id].mesh.position.set(p.x, 0, p.z);
                 }
            }
        }
    }

    // Remove
    for (const id in players) {
        if (!serverPlayers[id]) {
            scene.remove(players[id].mesh);
            delete players[id];
        }
    }

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
            if (!mobs[id].dead) {
                mobs[id].mesh.position.lerp(new THREE.Vector3(m.x, 0.4, m.z), 0.1);
            }
        }
    }

    // Projectiles
    const activeProjIds = new Set();
    for (const p of serverProjectiles) {
        activeProjIds.add(p.id);
        if (!projectiles[p.id]) {
            // Create
            let mesh;
            if (p.name === 'Fireball') {
                mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(p.radius, 8, 8),
                    new THREE.MeshBasicMaterial({ color: p.color })
                );
            } else if (p.name === 'Piercing Arrow') {
                mesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8),
                    new THREE.MeshBasicMaterial({ color: p.color })
                );
                mesh.rotation.set(Math.PI/2, 0, 0);
            } else {
                 mesh = new THREE.Mesh(
                    new THREE.SphereGeometry(p.radius, 8, 8),
                    new THREE.MeshBasicMaterial({ color: p.color })
                );
            }

            mesh.position.set(p.x, 0.5, p.z);

            if (p.name === 'Piercing Arrow') {
                 mesh.lookAt(p.x + p.vx, 0.5, p.z + p.vz);
                 mesh.rotateX(Math.PI / 2);
            }

            scene.add(mesh);
            projectiles[p.id] = mesh;
        } else {
            // Update
            const mesh = projectiles[p.id];
            mesh.position.lerp(new THREE.Vector3(p.x, 0.5, p.z), 0.3);
        }
    }
    // Remove old projectiles
    for (const id in projectiles) {
        if (!activeProjIds.has(id)) {
            scene.remove(projectiles[id]);
            delete projectiles[id];
        }
    }

    // Loot Bags
    const activeLootIds = new Set();
    for (const id in serverLoot) {
        const l = serverLoot[id];
        activeLootIds.add(id);
        if (!lootBags[id]) {
            const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
            const material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(l.x, 0.15, l.z);
            mesh.castShadow = true;
            mesh.userData = { id: id, type: 'loot' };
            scene.add(mesh);
            lootBags[id] = { mesh: mesh, itemId: l.itemId };
        }
    }
    for (const id in lootBags) {
        if (!activeLootIds.has(id)) {
            scene.remove(lootBags[id].mesh);
            delete lootBags[id];
        } else {
             // Check auto-pickup distance
             if (players[myId] && players[myId].mesh) {
                 const dist = lootBags[id].mesh.position.distanceTo(players[myId].mesh.position);
                 if (dist < 1.0) socket.emit('pickup', id);
             }
        }
    }

    // NPCs
    for (const id in serverNPCs) {
        const n = serverNPCs[id];
        if (!npcs[id]) {
            let geometry, color;
            if (n.type === 'Merchant') {
                geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
                color = 0xF1C40F; // Yellow
            } else {
                geometry = new THREE.BoxGeometry(0.8, 1.5, 0.8);
                color = 0xFFFFFF; // White
            }
            const material = new THREE.MeshLambertMaterial({ color: color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(n.x, 0.75, n.z);
            mesh.castShadow = true;
            mesh.userData = { id: id, type: 'npc' };
            scene.add(mesh);

            const label = document.createElement('div');
            label.className = 'npc-label';
            label.textContent = `${n.name} (Appuyez sur F)`;
            floatingTextContainer.appendChild(label);

            npcs[id] = { mesh: mesh, label: label, x: n.x, z: n.z };
        } else {
            const pos = npcs[id].mesh.position.clone();
            pos.y += 1.5;
            pos.project(camera);
            const x = (pos.x * .5 + .5) * window.innerWidth;
            const y = (-(pos.y * .5) + .5) * window.innerHeight;

            const label = npcs[id].label;
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;

            if (pos.z > 1) {
                label.style.display = 'none';
            } else {
                label.style.display = 'block';
            }
        }
    }
});

socket.on('damage', (data) => {
    if (gameStarted) {
        createFloatingText(`-${data.amount}`, data.x, data.z);
        // Effects
        particleSystem.createHitEffect(data.x, data.z);
        audioManager.playHit();
        // If mob, flash it
        for (const id in mobs) {
             const m = mobs[id];
             if (Math.abs(m.mesh.position.x - data.x) < 0.5 && Math.abs(m.mesh.position.z - data.z) < 0.5) {
                 flashMob(id);
             }
        }
    }
});

socket.on('effects', (events) => {
    if (!gameStarted) return;
    for (const event of events) {
        if (event.type === 'damage') {
             createFloatingText(`-${event.amount}`, event.x, event.z);
        } else if (event.type === 'effect') {
            if (event.name === 'whirlwind') {
                createWhirlwindEffect(event.x, event.z, event.radius);
            } else if (event.name === 'explosion') {
                createExplosionEffect(event.x, event.z);
            } else if (event.name === 'hit') {
                particleSystem.createHitEffect(event.x, event.z);
                audioManager.playHit();
            }
        } else if (event.type === 'damage_text') {
             createFloatingText(`-${event.amount}`, event.x, event.z);
        }
    }
});

function createWhirlwindEffect(x, z, radius) {
    const geometry = new THREE.TorusGeometry(radius, 0.2, 8, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.5, z);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);

    // Animate
    let scale = 0.1;
    const animateEffect = () => {
        scale += 0.1;
        mesh.scale.set(scale, scale, scale);
        mesh.material.opacity -= 0.05;
        if (mesh.material.opacity > 0) {
            requestAnimationFrame(animateEffect);
        } else {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        }
    };
    animateEffect();
}

function createExplosionEffect(x, z) {
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xFF4500, transparent: true, opacity: 0.8 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.5, z);
    scene.add(mesh);

    let scale = 1.0;
    const animateEffect = () => {
        scale += 0.2;
        mesh.scale.set(scale, scale, scale);
        mesh.material.opacity -= 0.1;
        if (mesh.material.opacity > 0) {
            requestAnimationFrame(animateEffect);
        } else {
            scene.remove(mesh);
            geometry.dispose();
            material.dispose();
        }
    };
    animateEffect();
}

socket.on('chatMessage', (data) => {
    if (!gameStarted) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.textContent = `${data.id.substring(0, 5)}: ${data.text}`;
    chatLog.appendChild(msgDiv);

    // System checks
    if (data.id === 'System') {
        if (data.text.includes('Level Up')) {
            audioManager.playLevelUp();
            if (players[myId]) {
                const pos = players[myId].mesh.position;
                particleSystem.createLevelUpEffect(pos.x, pos.z);
            }
        }
    }

    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => { if (msgDiv.parentNode) msgDiv.parentNode.removeChild(msgDiv); }, 1000);
    }, 10000);
});

// Visual Update Helpers
let isDead = false;
function handleDeathState(dead) {
    if (dead && !isDead) {
        isDead = true;
        deathScreen.style.display = 'flex';
    } else if (!dead && isDead) {
        isDead = false;
        deathScreen.style.display = 'none';
    }
}

function updatePlayerVisuals(playerObj, isDead, originalColor) {
    const mesh = playerObj.mesh;
    if (!mesh) return;
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
            chatInput.value = '';
            chatInput.blur();
        } else {
            e.preventDefault();
            chatInput.focus();
        }
        return;
    }
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) keys[e.key] = true;

    // Desktop Combat
    if (e.key === '1') {
        if (currentTargetId) {
             socket.emit('attack', currentTargetId);
             audioManager.playAttack();
        }
    }

    // Skill 2
    if (e.key === '2') {
        const cd = (myClass === 'Mage') ? 3000 : (myClass === 'Ranger') ? 5000 : 4000;
        if (Date.now() < cooldowns['2']) return;

        const input = getLocalInput();
        let dx = 0, dz = 0;
        if (players[myId]) {
             const rot = players[myId].mesh.rotation.y;
             dx = Math.sin(rot);
             dz = Math.cos(rot);
        }
        socket.emit('skill', { dx, dz });
        audioManager.playTone(300, 'sawtooth', 0.3); // Skill SFX

        // Trigger Cooldown
        cooldowns['2'] = Date.now() + cd;
        triggerCooldown('2', cd);
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) keys[e.key] = false;
});

// Touch Inputs
joystickContainer.addEventListener('touchstart', (e) => { e.preventDefault(); joystickActive = true; updateJoystick(e.changedTouches[0]); }, { passive: false });
joystickContainer.addEventListener('touchmove', (e) => { e.preventDefault(); if (joystickActive) updateJoystick(e.changedTouches[0]); }, { passive: false });
joystickContainer.addEventListener('touchend', (e) => { e.preventDefault(); joystickActive = false; joystickVector = { x: 0, y: 0 }; resetJoystickUI(); });

function updateJoystick(touch) {
    if (isInventoryOpen) return;
    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    let dx = x - centerX;
    let dy = y - centerY;
    const maxDist = (rect.width / 2) - 25;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickVector.x = dx / maxDist;
    joystickVector.y = dy / maxDist;
}
function resetJoystickUI() { joystickKnob.style.transform = `translate(-50%, -50%)`; }

actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted && currentTargetId) {
        socket.emit('attack', currentTargetId);
        audioManager.playAttack();
        actionButton.style.transform = "scale(0.9)";
    }
}, { passive: false });
actionButton.addEventListener('touchend', (e) => { e.preventDefault(); actionButton.style.transform = "scale(1)"; });

skillButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) {
        const cd = (myClass === 'Mage') ? 3000 : (myClass === 'Ranger') ? 5000 : 4000;
        if (Date.now() < cooldowns['2']) return;

        skillButton.style.transform = "scale(0.9)";
        let dx = 0, dz = 1;
        if (players[myId]) {
             const rot = players[myId].mesh.rotation.y;
             dx = Math.sin(rot);
             dz = Math.cos(rot);
        }
        socket.emit('skill', { dx, dz });
        audioManager.playTone(300, 'sawtooth', 0.3);

        cooldowns['2'] = Date.now() + cd;
        triggerCooldown('2', cd);
    }
}, { passive: false });
skillButton.addEventListener('touchend', (e) => { e.preventDefault(); skillButton.style.transform = "scale(1)"; });

function triggerCooldown(slot, durationMs) {
    const overlay = document.getElementById(`cd-${slot}`);
    if (overlay) {
        overlay.style.transition = 'none';
        overlay.style.height = '100%';
        void overlay.offsetWidth;
        overlay.style.transition = `height ${durationMs}ms linear`;
        overlay.style.height = '0%';
    }
}

document.getElementById('bag-button').addEventListener('click', toggleInventory);

function toggleInventory() {
    isInventoryOpen = !isInventoryOpen;
    document.getElementById('inventory-container').style.display = isInventoryOpen ? 'flex' : 'none';
    if (isInventoryOpen) renderInventory();
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    const slots = grid.querySelectorAll('.inv-slot');
    const tooltip = document.getElementById('item-tooltip');

    // Add Gold Display (if missing)
    if (!document.getElementById('gold-display')) {
        const goldDisplay = document.createElement('div');
        goldDisplay.id = 'gold-display';
        goldDisplay.style.color = '#f1c40f';
        goldDisplay.style.marginBottom = '5px';
        goldDisplay.textContent = `Gold: ${myGold}`;
        inventoryContainer.insertBefore(goldDisplay, grid);
    } else {
        document.getElementById('gold-display').textContent = `Gold: ${myGold}`;
    }

    slots.forEach(slot => {
        slot.innerHTML = '';
        slot.classList.remove('equipped');
        slot.onclick = null;
        slot.onmouseenter = null;
        slot.onmouseleave = null;
        slot.onmousemove = null;
    });

    myInventory.forEach((item, index) => {
        if (index >= 16) return;
        const slot = slots[index];
        const def = ITEM_DEFS[item.itemId] || { name: item.itemId, color: '#ccc', stats: '' };

        const icon = document.createElement('div');
        icon.className = 'inv-item-icon';
        icon.style.backgroundColor = def.color;
        slot.appendChild(icon);

        if (item.equipped) slot.classList.add('equipped');

        slot.onclick = () => socket.emit('useItem', index);

        slot.onmouseenter = () => {
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<strong>${def.name}</strong>${item.equipped ? ' (Equipped)' : ''}<br><span style='color:yellow'>${def.stats || ''}</span>`;
        };

        slot.onmousemove = (e) => {
            tooltip.style.left = (e.pageX + 15) + 'px';
            tooltip.style.top = (e.pageY + 15) + 'px';
        };

        slot.onmouseleave = () => { tooltip.style.display = 'none'; };
    });
}

// Targeting & Click
window.addEventListener('click', (event) => {
    if (!gameStarted) return;

    if (isInventoryOpen && !event.target.closest('#inventory-container') && !event.target.closest('#bag-button')) toggleInventory();
    if (isShopOpen && !event.target.closest('#shop-container')) { isShopOpen = false; document.getElementById('shop-container').style.display = 'none'; }
    if (isQuestOpen && !event.target.closest('#quest-dialog')) { isQuestOpen = false; document.getElementById('quest-dialog').style.display = 'none'; }

    if (event.target.closest('#ui-layer') || event.target.closest('#joystick-container') || event.target.closest('#action-button') || event.target.closest('#inventory-container') || event.target.closest('#shop-container') || event.target.closest('#quest-dialog') || event.target.closest('#bag-button')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const objects = [];
    for (const id in mobs) { if (mobs[id].mesh && !mobs[id].dead) objects.push(mobs[id].mesh); }
    for (const id in lootBags) { objects.push(lootBags[id].mesh); }
    for (const id in npcs) { objects.push(npcs[id].mesh); }

    const intersects = raycaster.intersectObjects(objects);

    nearbyNpcId = null;

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData.type === 'mob') {
            currentTargetId = hit.userData.id;
            updateTargetRing();
        } else if (hit.userData.type === 'loot') {
            socket.emit('pickup', hit.userData.id);
        } else if (hit.userData.type === 'npc') {
            nearbyNpcId = hit.userData.id;
            socket.emit('interact', nearbyNpcId);
        }
    } else {
        currentTargetId = null;
        updateTargetRing();
    }
});

function getLocalInput() {
    if (document.activeElement === chatInput) return { x: 0, z: 0 };
    if (isInventoryOpen) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    if (keys['w'] || keys['z'] || keys['ArrowUp']) z -= 1;
    if (keys['s'] || keys['ArrowDown']) z += 1;
    if (keys['a'] || keys['q'] || keys['ArrowLeft']) x -= 1;
    if (keys['d'] || keys['ArrowRight']) x += 1;
    if (joystickActive) { x = joystickVector.x; z = joystickVector.y; }
    return { x, z };
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (!gameStarted) {
        const speed = 0.5;
        const radius = 15;
        const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time * speed) * radius;
        camera.position.z = Math.sin(time * speed) * radius;
        camera.position.y = 8;
        camera.lookAt(0, 0, 0);
    } else {
        // Particles
        particleSystem.update(delta);

        // Day/Night Cycle
        const time = Date.now() * 0.0001;
        const lx = Math.sin(time) * 20;
        const ly = Math.abs(Math.cos(time)) * 20 + 5;
        const lz = Math.cos(time) * 20;
        dirLight.position.set(lx, ly, lz);
        dirLight.intensity = Math.max(0.2, ly / 25);

        // Walk Dust
        if (myId && players[myId]) {
             const input = getLocalInput();
             if ((input.x !== 0 || input.z !== 0) && Math.random() < 0.1) {
                 const pos = players[myId].mesh.position;
                 particleSystem.createWalkDust(pos.x, pos.z);
             }
        }

        // Game Mode
        if (myId && players[myId]) {
            const input = getLocalInput();
            if ((input.x !== 0 || input.z !== 0) && !isDead) {
                const len = Math.sqrt(input.x*input.x + input.z*input.z);
                const dx = (input.x / len);
                const dz = (input.z / len);
                socket.emit('move', { x: dx, z: dz });
                const moveDistance = PLAYER_SPEED_PER_SEC * delta;
                const myMesh = players[myId].mesh;
                myMesh.position.x += dx * moveDistance;
                myMesh.position.z += dz * moveDistance;
                const targetRotation = Math.atan2(dx, dz);
                myMesh.rotation.y = targetRotation;
            }
            const myMesh = players[myId].mesh;
            const cameraOffset = new THREE.Vector3(0, 5, 8);
            const targetCamPos = myMesh.position.clone().add(cameraOffset);
            camera.position.lerp(targetCamPos, 0.05);
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
            if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                player.mesh.rotation.y = Math.atan2(dx, dz);
            }
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
