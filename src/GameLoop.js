const Player = require('./Player');
const World = require('./World');
const Constants = require('./Constants');

class GameLoop {
    constructor() {
        this.players = {};
        this.playerInputs = {}; // Store input for processing in tick
        this.interval = null;
        this.TICK_RATE = Constants.TICK_RATE;
        this.TICK_TIME = 1000 / this.TICK_RATE;
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
        for (const id in this.players) {
            const player = this.players[id];
            const input = this.playerInputs[id];

            if (input) {
                player.handleInput(input, World);
                this.playerInputs[id] = null; // Consume input
            }
        }
    }

    broadcast(io) {
        io.emit('state', this.players);
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
}

module.exports = new GameLoop();
