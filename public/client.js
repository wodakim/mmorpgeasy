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

// Lighting
const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.8);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
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
const projectiles = {}; // Client-side projectile meshes
let myId = null;
let myUserId = null;
let myUsername = null;
let myClass = null;
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

// Variables for Menu State
let selectedClass = 'Guerrier';
let selectedColor = '#ffffff';

// --- MENU LOGIC ---

// Login
document.getElementById('btn-login').addEventListener('click', () => {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    if (user && pass) socket.emit('login', { username: user, password: pass });
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
        // Convert hex to int
        const colorInt = parseInt(selectedColor.replace('#', '0x'), 16);
        socket.emit('createCharacter', { userId: myUserId, name: name, className: selectedClass, color: colorInt });
    }
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
    console.log('Entered world as', myId, myClass);

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

// Functions (Mob Mesh, Player Mesh, Floating Text, World Gen) - Kept from Phase 5 but refactored slightly

function createMobMesh() {
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const material = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.4;
    return mesh;
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
    // Phase 6: We might receive state updates even if not "in game" yet (for background visuals)
    // But typically we care about rendering other players.

    const serverPlayers = state.players || {};
    const serverMobs = state.mobs || {};
    const serverProjectiles = state.projectiles || [];

    // Players
    for (const id in serverPlayers) {
        const p = serverPlayers[id];

        // Update UI for me ONLY if game started
        if (gameStarted && id === myId) {
            updateStatsUI(p);
            handleDeathState(p.dead);
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
                    new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), // Thin cylinder
                    new THREE.MeshBasicMaterial({ color: p.color })
                );
                // Rotate to match direction
                mesh.rotation.x = Math.PI / 2; // Flat
                mesh.rotation.z = Math.atan2(p.vx, p.vz); // Heading? No, Cylinder default is Y-up.
                // We need to orient cylinder along velocity vector.
                // If geometry is vertical (Y-up), we rotate X to make it Z-forward, then rotate Y for direction?
                // Simpler: Just LookAt target.
                // Reset rotation
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
                 mesh.rotateX(Math.PI / 2); // Adjust if necessary based on geometry
            }

            scene.add(mesh);
            projectiles[p.id] = mesh;
        } else {
            // Update
            const mesh = projectiles[p.id];
            mesh.position.lerp(new THREE.Vector3(p.x, 0.5, p.z), 0.3);
            // Update orientation if needed? Velocity is constant so orientation shouldn't change much.
        }
    }
    // Remove old projectiles
    for (const id in projectiles) {
        if (!activeProjIds.has(id)) {
            scene.remove(projectiles[id]);
            delete projectiles[id];
        }
    }
});

socket.on('damage', (data) => {
    if (gameStarted) createFloatingText(`-${data.amount}`, data.x, data.z);
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
                // Small hit puff?
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
    if (e.key === '1' && currentTargetId) socket.emit('attack', currentTargetId);

    // Skill 2
    if (e.key === '2') {
        const input = getLocalInput();
        // We need player direction. If stationary, use last moved direction or camera direction?
        // Simple: Use current movement input. If zero, use camera direction?
        // Or assume player faces rotation.y.
        let dx = 0, dz = 0;
        if (players[myId]) {
             const rot = players[myId].mesh.rotation.y;
             // Mesh rotation y is strictly derived from movement?
             // Not really, it's atan2(dx, dz).
             // Let's use rotation to derive vector.
             dx = Math.sin(rot);
             dz = Math.cos(rot);
        }
        socket.emit('skill', { dx, dz });
        const cd = (myClass === 'Mage') ? 3000 : (myClass === 'Ranger') ? 5000 : 4000;
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
        actionButton.style.transform = "scale(0.9)";
    }
}, { passive: false });
actionButton.addEventListener('touchend', (e) => { e.preventDefault(); actionButton.style.transform = "scale(1)"; });

skillButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) {
        skillButton.style.transform = "scale(0.9)";
        let dx = 0, dz = 1;
        if (players[myId]) {
             const rot = players[myId].mesh.rotation.y;
             dx = Math.sin(rot);
             dz = Math.cos(rot);
        }
        socket.emit('skill', { dx, dz });
        const cd = (myClass === 'Mage') ? 3000 : (myClass === 'Ranger') ? 5000 : 4000;
        triggerCooldown('2', cd);
    }
}, { passive: false });
skillButton.addEventListener('touchend', (e) => { e.preventDefault(); skillButton.style.transform = "scale(1)"; });

function triggerCooldown(slot, durationMs) {
    const overlay = document.getElementById(`cd-${slot}`);
    if (overlay) {
        overlay.style.transition = 'none';
        overlay.style.height = '100%';
        // Force reflow
        void overlay.offsetWidth;
        overlay.style.transition = `height ${durationMs}ms linear`;
        overlay.style.height = '0%';
    }
}

// Targeting
window.addEventListener('click', (event) => {
    if (!gameStarted) return;
    if (event.target.closest('#ui-layer') || event.target.closest('#joystick-container') || event.target.closest('#action-button')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const mobMeshes = [];
    for (const id in mobs) { if (mobs[id].mesh && !mobs[id].dead) mobMeshes.push(mobs[id].mesh); }
    const intersects = raycaster.intersectObjects(mobMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        for (const id in mobs) {
            if (mobs[id].mesh === hit) {
                currentTargetId = id;
                updateTargetRing();
                break;
            }
        }
    } else {
        currentTargetId = null;
        updateTargetRing();
    }
});

function getLocalInput() {
    if (document.activeElement === chatInput) return { x: 0, z: 0 };
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
        // Menu Mode: Auto Rotate Camera
        const speed = 0.5;
        const radius = 15;
        const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time * speed) * radius;
        camera.position.z = Math.sin(time * speed) * radius;
        camera.position.y = 8;
        camera.lookAt(0, 0, 0);
    } else {
        // Game Mode
        // 1. Client-side Prediction for ME
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
            // Camera Follow
            const myMesh = players[myId].mesh;
            const cameraOffset = new THREE.Vector3(0, 5, 8);
            const targetCamPos = myMesh.position.clone().add(cameraOffset);
            camera.position.lerp(targetCamPos, 0.05);
            camera.lookAt(myMesh.position);
        }
        if (currentTargetId) updateTargetRing();
    }

    // 2. Interpolate OTHER players
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
