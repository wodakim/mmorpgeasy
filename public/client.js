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
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

// Functions
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

socket.on('state', (serverPlayers) => {
    // 1. Update existing players and create new ones
    for (const id in serverPlayers) {
        const p = serverPlayers[id];

        if (!players[id]) {
            // Create new player
            const mesh = createPlayerMesh(p.color);
            mesh.position.set(p.x, 0, p.z);
            scene.add(mesh);

            // Store mesh and target position
            players[id] = {
                mesh: mesh,
                targetPosition: new THREE.Vector3(p.x, 0, p.z)
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
});

// Input Handling
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
        keys[e.key] = false;
    }
});

function getLocalInput() {
    let x = 0;
    let z = 0;

    if (keys['w'] || keys['ArrowUp']) z -= 1;
    if (keys['s'] || keys['ArrowDown']) z += 1;
    if (keys['a'] || keys['ArrowLeft']) x -= 1;
    if (keys['d'] || keys['ArrowRight']) x += 1;

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
