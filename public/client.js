// Initialize Three.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const light = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
scene.add(light);

// Ground
const geometry = new THREE.PlaneGeometry(50, 50);
const material = new THREE.MeshBasicMaterial({ color: 0x228B22, side: THREE.DoubleSide }); // Forest Green
const plane = new THREE.Mesh(geometry, material);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

// Players
const players = {}; // Local storage for player meshes
const socket = io();

// Interpolation speed
const LERP_FACTOR = 0.1;

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('state', (serverPlayers) => {
    // 1. Update existing players and create new ones
    for (const id in serverPlayers) {
        const p = serverPlayers[id];

        if (!players[id]) {
            // Create new player
            const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
            const playerMaterial = new THREE.MeshLambertMaterial({ color: p.color });
            const mesh = new THREE.Mesh(playerGeometry, playerMaterial);

            mesh.position.set(p.x, 0.5, p.z);
            scene.add(mesh);

            // Store mesh and target position
            players[id] = {
                mesh: mesh,
                targetPosition: new THREE.Vector3(p.x, 0.5, p.z)
            };
        } else {
            // Update target position
            players[id].targetPosition.set(p.x, 0.5, p.z);
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

// Render Loop
function animate() {
    requestAnimationFrame(animate);

    // Interpolate positions
    for (const id in players) {
        const player = players[id];
        if (player.mesh && player.targetPosition) {
            player.mesh.position.lerp(player.targetPosition, LERP_FACTOR);
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
