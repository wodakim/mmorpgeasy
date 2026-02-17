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
        this.lastAttackTime = 0;
    }

    update(players, world) {
        if (this.dead) return;

        // Find closest player
        let target = null;
        let minDist = Constants.MOB_AGGRO_RANGE;

        for (const id in players) {
            const p = players[id];
            if (p.dead) continue; // Ignore dead players

            const dist = Math.sqrt((this.x - p.x)**2 + (this.z - p.z)**2);
            if (dist < minDist) {
                minDist = dist;
                target = p;
            }
        }

        if (target) {
            // Chase
            if (minDist > Constants.MOB_ATTACK_RANGE - 0.5) { // Stop slightly before hitting
                const dx = target.x - this.x;
                const dz = target.z - this.z;
                const len = Math.sqrt(dx*dx + dz*dz);

                // Move towards target
                const speed = Constants.MOB_SPEED / Constants.TICK_RATE; // Speed per tick
                this.x += (dx / len) * speed;
                this.z += (dz / len) * speed;
            }

            // Attack
            if (minDist < Constants.MOB_ATTACK_RANGE) {
                if (Date.now() - this.lastAttackTime > Constants.MOB_ATTACK_COOLDOWN) {
                    target.takeDamage(Constants.MOB_DAMAGE);
                    this.lastAttackTime = Date.now();
                    return { type: 'attack', targetId: target.id, damage: Constants.MOB_DAMAGE };
                }
            }
        }
        return null;
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
