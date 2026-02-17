class Player {
    constructor(id) {
        this.id = id;
        this.x = (Math.random() - 0.5) * 5; // Start closer to center
        this.z = (Math.random() - 0.5) * 5;
        this.color = Math.floor(Math.random() * 0xffffff);
        // Speed is now handled by Constants or passed in, but for now we hardcode per-tick speed
        // Server runs at 20 ticks/sec. Desired speed = 4 units/sec.
        // Speed per tick = 4 / 20 = 0.2
        this.speed = 0.2;

        // Phase 3: Stats
        this.hp = 100;
        this.maxHp = 100;
        this.mana = 50;
        this.maxMana = 50;
        this.level = 1;
    }

    handleInput(inputVector, world) {
        if (!inputVector || (inputVector.x === 0 && inputVector.z === 0)) return;

        // Normalize input vector
        const length = Math.sqrt(inputVector.x * inputVector.x + inputVector.z * inputVector.z);
        if (length === 0) return;

        // Scale by speed (per tick)
        const dx = (inputVector.x / length) * this.speed;
        const dz = (inputVector.z / length) * this.speed;

        // Calculate potential new position
        const newX = this.x + dx;
        const newZ = this.z + dz;

        // Check collision before moving
        // We can do simple separate axis check to allow sliding along walls
        if (!world.checkCollision(newX, this.z)) {
            this.x = newX;
        }
        if (!world.checkCollision(this.x, newZ)) {
            this.z = newZ;
        }

        // Keep within bounds (optional, but good practice)
        if (this.x > 25) this.x = 25;
        if (this.x < -25) this.x = -25;
        if (this.z > 25) this.z = 25;
        if (this.z < -25) this.z = -25;
    }
}

module.exports = Player;
