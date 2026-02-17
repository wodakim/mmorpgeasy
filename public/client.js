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
const players = {}; // Local storage for player meshes
let myId = null;
let worldBlocks = [];

// Constants
const PLAYER_SPEED_PER_SEC = 4; // Should match server units/sec (0.2 * 20)

// Input State
const keys = {
    w: false, a: false, s: false, d: false,
    z: false, q: false, // AZERTY support
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

// UI Elements
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
const deathScreen = document.getElementById('death-screen');

// Mobs & Combat State
const mobs = {}; // { id: { mesh: THREE.Mesh, hp: number, maxHp: number } }
let currentTargetId = null;
let targetRing = null;

// Joystick State
let joystickActive = false;
let joystickVector = { x: 0, y: 0 }; // Normalized -1 to 1

// Raycaster for targeting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Functions
function createMobMesh() {
    // Red Cube for Mob
    const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const material = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.4;

    // Optional: HP Bar above head (sprite) could go here
    return mesh;
}

function updateTargetRing() {
    if (!targetRing) {
        const geometry = new THREE.RingGeometry(0.6, 0.7, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0xFF0000, side: THREE.DoubleSide });
        targetRing = new THREE.Mesh(geometry, material);
        targetRing.rotation.x = -Math.PI / 2;
        targetRing.position.y = 0.05; // Just above ground
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
        currentTargetId = null; // Reset if target gone
    }
}

function createFloatingText(text, x, z, isCrit = false) {
    const div = document.createElement('div');
    div.className = 'floating-text' + (isCrit ? ' crit' : '');
    div.textContent = text;
    floatingTextContainer.appendChild(div);

    // Position needs to be updated in render loop to track 3D position
    // But for simple "float up from where it happened", we can just set initial pos
    // and let CSS animation handle the float.
    // We need to project world (x, 0.5, z) to screen coords.

    const pos = new THREE.Vector3(x, 1.5, z);
    pos.project(camera);

    const xPos = (pos.x * .5 + .5) * window.innerWidth;
    const yPos = (-(pos.y * .5) + .5) * window.innerHeight;

    div.style.left = `${xPos}px`;
    div.style.top = `${yPos}px`;

    // Remove after animation
    setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div);
    }, 1000);
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
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa, flatShading: true }); // Skin toneish
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.25;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    // Eyes (direction indicator)
    const eyeGeo = new THREE.PlaneGeometry(0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.15, 1.3, 0.26); // Slightly in front of face
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.15, 1.3, 0.26);
    group.add(rightEye);

    return group;
}

function getBlockColor(height) {
    if (height > 3) return 0x6F7887; // Stone
    if (height > 1.5) return 0x57D066; // Grass
    return 0x4FB4E6; // Water (or just low blocks)
}

function generateWorld(blocks) {
    // Clear existing blocks if any (optional for now)

    blocks.forEach(block => {
        const geometry = new THREE.BoxGeometry(1, block.height, 1);
        const color = getBlockColor(block.height);
        const material = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
        const mesh = new THREE.Mesh(geometry, material);

        // Position: x, z from server. y is half height because BoxGeometry is centered
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

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    myId = socket.id;
});

socket.on('state', (state) => {
    // Phase 4 Update: State contains { players, mobs }
    const serverPlayers = state.players || {};
    const serverMobs = state.mobs || {};

    // --- PLAYERS ---
    // 1. Update existing players and create new ones
    for (const id in serverPlayers) {
        const p = serverPlayers[id];

        // Update UI for me
        if (id === myId) {
            updateStatsUI(p);
            updateInterface(p.level); // Progressive disclosure
            handleDeathState(p.dead);
        }

        // Handle visual death state for everyone
        if (players[id]) {
             updatePlayerVisuals(players[id], p.dead, p.color);
        }

        if (!players[id]) {
            // Create new player
            const mesh = createPlayerMesh(p.color);
            mesh.position.set(p.x, 0, p.z);
            scene.add(mesh);

            // Store mesh and target position
            players[id] = {
                mesh: mesh,
                targetPosition: new THREE.Vector3(p.x, 0, p.z),
                originalColor: p.color // Store original color for respawn
            };
        } else {
            // Update target position
            players[id].targetPosition.set(p.x, 0, p.z);

            // Simple reconciliation: if drift is huge, teleport
            if (id === myId) {
                 const dist = players[id].mesh.position.distanceTo(new THREE.Vector3(p.x, 0, p.z));
                 if (dist > 2.0) {
                     players[id].mesh.position.set(p.x, 0, p.z);
                 }
            }
        }
    }

    // 2. Remove disconnected players
    for (const id in players) {
        if (!serverPlayers[id]) {
            scene.remove(players[id].mesh);
            delete players[id];
        }
    }

    // --- MOBS ---
    for (const id in serverMobs) {
        const m = serverMobs[id];

        if (!mobs[id]) {
            // New Mob
            const mesh = createMobMesh();
            mesh.position.set(m.x, 0.4, m.z);
            scene.add(mesh);

            // Allow raycasting
            mesh.userData = { id: id, type: 'mob' };

            mobs[id] = { mesh: mesh, hp: m.hp, maxHp: m.maxHp };
        } else {
            // Update Mob
            if (m.dead && !mobs[id].dead) {
                // Just died
                scene.remove(mobs[id].mesh);
                mobs[id].dead = true;
                if (currentTargetId === id) currentTargetId = null;
            } else if (!m.dead && mobs[id].dead) {
                // Respawned
                scene.add(mobs[id].mesh);
                mobs[id].dead = false;
                mobs[id].mesh.position.set(m.x, 0.4, m.z);
            }
            mobs[id].hp = m.hp;
        }
    }

    // Cleanup Mobs (Optional if mobs can despawn, currently always 5)
});

socket.on('damage', (data) => {
    // Show Floating Text
    createFloatingText(`-${data.amount}`, data.x, data.z);

    // Update local HP if we want smooth bars on mobs later
});

// Chat Handling
socket.on('chatMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    // Use textContent for safety
    msgDiv.textContent = `${data.id.substring(0, 5)}: ${data.text}`;
    chatLog.appendChild(msgDiv);

    // Auto fade-out
    setTimeout(() => {
        msgDiv.classList.add('fade-out');
        setTimeout(() => {
            if (msgDiv.parentNode) msgDiv.parentNode.removeChild(msgDiv);
        }, 1000); // Wait for transition
    }, 10000); // 10 seconds visible
});

// UI Logic
function updateStatsUI(player) {
    if (!player) return;
    if (hpBar) hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    if (manaBar) manaBar.style.width = `${(player.mana / player.maxMana) * 100}%`;
    if (xpBar) xpBar.style.width = `${(player.xp / player.maxXp) * 100}%`;
}

function updateInterface(level) {
    if (level < 2) {
        // Hide action bar for level < 2 if desired, or grey out
        // For now, per instructions, we just have the function ready
        // actionBar.style.display = 'none';
    } else {
        // actionBar.style.display = 'flex';
    }
}

let isDead = false;
function handleDeathState(dead) {
    // Only handles UI overlay for local player
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
        // Apply dead visuals if not already applied
        if (mesh.rotation.z !== Math.PI / 2) {
            mesh.rotation.z = Math.PI / 2;
            mesh.traverse(child => {
                if (child.isMesh) child.material.color.setHex(0x555555);
            });
        }
    } else {
        // Apply alive visuals if needed
        if (mesh.rotation.z !== 0) {
            mesh.rotation.z = 0;
            // Restore colors
            if (mesh.children[0]) mesh.children[0].material.color.setHex(originalColor);
            if (mesh.children[1]) mesh.children[1].material.color.setHex(0xffccaa);
            if (mesh.children[2]) mesh.children[2].material.color.setHex(0x000000);
            if (mesh.children[3]) mesh.children[3].material.color.setHex(0x000000);
        }
    }
}

// Input Handling
window.addEventListener('keydown', (e) => {
    // Chat Toggle Logic
    if (e.key === 'Enter') {
        if (document.activeElement === chatInput) {
            // Send message
            const text = chatInput.value.trim();
            if (text.length > 0) {
                socket.emit('chatMessage', text);
            }
            chatInput.value = '';
            chatInput.blur(); // Return focus to game
        } else {
            // Focus chat
            // Need to prevent the 'Enter' from being typed into the input if we just focused it?
            // Usually 'focus()' doesn't type the key, but let's be safe.
            e.preventDefault();
            chatInput.focus();
        }
        return;
    }

    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
        keys[e.key] = false;
    }
});

// --- Touch Controls ---

// Joystick
joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    updateJoystick(e.changedTouches[0]);
}, { passive: false });

joystickContainer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (joystickActive) {
        // Find the touch associated with the joystick if multiple
        // Assuming first touch in container is joystick for simplicity
        updateJoystick(e.changedTouches[0]);
    }
}, { passive: false });

joystickContainer.addEventListener('touchend', (e) => {
    e.preventDefault();
    joystickActive = false;
    joystickVector = { x: 0, y: 0 };
    resetJoystickUI();
});

function updateJoystick(touch) {
    const rect = joystickContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Relative to container
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Vector from center
    let dx = x - centerX;
    let dy = y - centerY;

    // Max distance (radius of container - radius of knob)
    const maxDist = (rect.width / 2) - 25;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Normalize if too far
    if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
    }

    // Update Knob UI
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Set Vector (-1 to 1)
    joystickVector.x = dx / maxDist;
    joystickVector.y = dy / maxDist;
}

function resetJoystickUI() {
    joystickKnob.style.transform = `translate(-50%, -50%)`;
}

// Action Button
actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (currentTargetId) {
        socket.emit('attack', currentTargetId);
        // Visual feedback on button?
        actionButton.style.transform = "scale(0.9)";
    }
}, { passive: false });

actionButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    actionButton.style.transform = "scale(1)";
});


// Targeting & Combat Input
window.addEventListener('click', (event) => {
    if (event.target.closest('#ui-layer')) return; // Ignore clicks on UI

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Filter meshes that are mobs
    const mobMeshes = [];
    for (const id in mobs) {
        if (mobs[id].mesh && !mobs[id].dead) mobMeshes.push(mobs[id].mesh);
    }

    const intersects = raycaster.intersectObjects(mobMeshes);

    if (intersects.length > 0) {
        // Find mob ID
        const hit = intersects[0].object;
        // Simple linear search or userData
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

window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
        if (currentTargetId) {
            socket.emit('attack', currentTargetId);
        }
    }
});

function getLocalInput() {
    // Block movement if typing in chat
    if (document.activeElement === chatInput) {
        return { x: 0, z: 0 };
    }

    let x = 0;
    let z = 0;

    // Keyboard (ZQSD/WASD + Arrows)
    if (keys['w'] || keys['z'] || keys['ArrowUp']) z -= 1;
    if (keys['s'] || keys['ArrowDown']) z += 1;
    if (keys['a'] || keys['q'] || keys['ArrowLeft']) x -= 1;
    if (keys['d'] || keys['ArrowRight']) x += 1;

    // Joystick Override
    if (joystickActive) {
        x = joystickVector.x;
        z = joystickVector.y;
    }

    return { x, z };
}

// Render Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Time since last frame in seconds

    // 1. Client-side Prediction for ME
    if (myId && players[myId]) {
        const input = getLocalInput();

        if (input.x !== 0 || input.z !== 0) {
            // Normalize
            const len = Math.sqrt(input.x*input.x + input.z*input.z);
            const dx = (input.x / len);
            const dz = (input.z / len);

            // Send to server
            // Note: Server expects direction vector. It applies speed per tick.
            // We just send the normalized direction.
            socket.emit('move', { x: dx, z: dz });

            // Move locally (Prediction)
            // Use time-based movement: Speed * delta time
            const moveDistance = PLAYER_SPEED_PER_SEC * delta;

            const myMesh = players[myId].mesh;
            myMesh.position.x += dx * moveDistance;
            myMesh.position.z += dz * moveDistance;

            // Rotate character to face direction
            const targetRotation = Math.atan2(dx, dz);
            myMesh.rotation.y = targetRotation;
        }

        // 3. Camera Follow
        const myMesh = players[myId].mesh;

        // Target position: behind and above
        const cameraOffset = new THREE.Vector3(0, 5, 8);
        const targetCamPos = myMesh.position.clone().add(cameraOffset);

        camera.position.lerp(targetCamPos, 0.05);
        camera.lookAt(myMesh.position);
    }

    // Update Ring Position if target moves
    if (currentTargetId) updateTargetRing();

    // 2. Interpolate OTHER players
    for (const id in players) {
        if (id === myId) continue; // Skip me, I moved myself

        const player = players[id];
        if (player.mesh && player.targetPosition) {
            player.mesh.position.lerp(player.targetPosition, 0.1);

            // Also update rotation if moving
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

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
