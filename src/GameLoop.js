const Player = require('./Player');
const World = require('./World');
const Constants = require('./Constants');
const Mob = require('./Mob');

class GameLoop {
    constructor() {
        this.players = {};
        this.playerInputs = {};
        this.mobs = {};
        this.interval = null;
        this.TICK_RATE = Constants.TICK_RATE;
        this.TICK_TIME = 1000 / this.TICK_RATE;

        this.initMobs();
    }

    initMobs() {
        // Spawn 5 mobs at fixed or random positions
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * 20) - 10;
            const z = Math.floor(Math.random() * 20) - 10;
            // Ensure not in a block (simple check)
            if (!World.checkCollision(x, z)) {
                const mobId = `mob_${i}`;
                this.mobs[mobId] = new Mob(mobId, x, z);
            } else {
                i--; // Retry
            }
        }
    }

    start(io) {
        if (this.interval) return;
        this.interval = setInterval(() => {
            this.update();
            this.broadcast(io);
        }, this.TICK_TIME);
        console.log(`Game loop started at ${this.TICK_RATE} ticks/sec`);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }


    update() {
        // Update Players
        for (const id in this.players) {
            const player = this.players[id];

            // Handle Respawn
            if (player.dead) {
                 if (player.respawn()) {
                     // Just respawned
                 }
                 continue; // Don't process input if dead
            }

            const input = this.playerInputs[id];
            if (input) {
                player.handleInput(input, World);
                this.playerInputs[id] = null; // Consume input
            }
        }

        // Update Mobs (AI & Respawn)
        for (const id in this.mobs) {
            const mob = this.mobs[id];

            if (mob.dead) {
                if (Date.now() > mob.respawnTimer) {
                    mob.respawn();
                }
            } else {
                // AI Update
                const action = mob.update(this.players, World);
                if (action && action.type === 'attack') {
                     // Player took damage, logic handled inside mob.update calling player.takeDamage
                     // But we might want to broadcast damage effect
                     // Although floating text on player is usually for damage dealt, let's keep it simple.
                     // Maybe flash screen red on client?
                }
            }
        }
    }

    broadcast(io) {
        io.emit('state', {
            players: this.players,
            mobs: this.mobs
        });
    }

    addPlayer(id) {
        this.players[id] = new Player(id);
        console.log(`Player ${id} added`);
    }

    removePlayer(id) {
        if (this.players[id]) {
            delete this.players[id];
            delete this.playerInputs[id];
            console.log(`Player ${id} removed`);
        }
    }

    handlePlayerInput(id, input) {
        this.playerInputs[id] = input;
    }

    getWorldBlocks() {
        return World.blocks;
    }

    getMob(id) {
        return this.mobs[id];
    }

    getPlayer(id) {
        return this.players[id];
    }
}

module.exports = new GameLoop();
