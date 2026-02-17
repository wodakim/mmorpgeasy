const Player = require('./Player');

class GameLoop {
    constructor() {
        this.players = {};
        this.interval = null;
        this.TICK_RATE = 20; // 20 ticks per second
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
            this.players[id].move();
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
            console.log(`Player ${id} removed`);
        }
    }
}

module.exports = new GameLoop();
