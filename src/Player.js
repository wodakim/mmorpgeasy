class Player {
    constructor(id) {
        this.id = id;
        this.x = (Math.random() - 0.5) * 10; // Random position between -5 and 5
        this.z = (Math.random() - 0.5) * 10;
        this.color = Math.floor(Math.random() * 0xffffff);
    }

    move() {
        // Random Brownian motion
        const speed = 0.1;
        this.x += (Math.random() - 0.5) * speed;
        this.z += (Math.random() - 0.5) * speed;

        // Keep within bounds (optional, but good practice)
        if (this.x > 20) this.x = 20;
        if (this.x < -20) this.x = -20;
        if (this.z > 20) this.z = 20;
        if (this.z < -20) this.z = -20;
    }
}

module.exports = Player;
