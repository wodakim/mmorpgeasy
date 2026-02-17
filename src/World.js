const Constants = require('./Constants');

class World {
    constructor() {
        this.blocks = [];
        this.generate();
    }

    generate() {
        // Deterministic generation based on a simple algorithm
        // We'll create a few random-looking blocks
        // Using a fixed seed approach for simplicity (Math.random is not seedable in JS by default without a library)
        // So we'll use a simple linear congruential generator or just a fixed pattern for now.

        const seed = 12345;
        let random = (seed) => {
            var x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        let currentSeed = seed;
        const numBlocks = 50;

        for (let i = 0; i < numBlocks; i++) {
            const x = Math.floor((random(currentSeed++) * Constants.MAP_SIZE) - (Constants.MAP_SIZE / 2));
            const z = Math.floor((random(currentSeed++) * Constants.MAP_SIZE) - (Constants.MAP_SIZE / 2));
            const height = 1 + Math.floor(random(currentSeed++) * 3); // Height 1 to 4

            // Ensure we don't spawn blocks at 0,0 where players spawn
            if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;

            this.blocks.push({ x, z, height });
        }
    }

    getBlocks() {
        return this.blocks;
    }

    checkCollision(x, z) {
        // Simple AABB collision check (player size 1x1 assumed centered)
        // We check if the point (x,z) is inside any block
        // Blocks are 1x1 on x/z plane, centered at integer coordinates?
        // Let's assume blocks are 1x1 and their x,z is their center.
        const halfSize = 0.5; // Block half size
        const playerRadius = 0.4; // Slightly smaller than half block to allow sliding

        for (const block of this.blocks) {
            if (x + playerRadius > block.x - halfSize && x - playerRadius < block.x + halfSize &&
                z + playerRadius > block.z - halfSize && z - playerRadius < block.z + halfSize) {
                return true;
            }
        }
        return false;
    }
}

module.exports = new World();
