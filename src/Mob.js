const Constants = require('./Constants');

class Mob {
    constructor(id, x, z) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.hp = 50;
        this.maxHp = 50;
        this.xpValue = Constants.MOB_XP;
        this.dead = false;
        this.respawnTimer = 0;
        this.originalX = x; // For respawning
        this.originalZ = z;
    }

    takeDamage(amount) {
        if (this.dead) return 0;

        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            this.respawnTimer = Date.now() + Constants.MOB_RESPAWN_TIME;
            return this.xpValue; // Return XP if killed
        }
        return 0; // Not dead yet
    }

    respawn() {
        if (this.dead && Date.now() > this.respawnTimer) {
            this.dead = false;
            this.hp = this.maxHp;
            this.x = this.originalX;
            this.z = this.originalZ;
            return true;
        }
        return false;
    }
}

module.exports = Mob;
