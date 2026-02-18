const ItemSystem = require('./ItemSystem');

class Player {
    constructor(id, data) {
        this.id = id;
        // Persistence Data
        this.userId = data.userId || null; // Database User ID
        this.username = data.username || 'Guest';
        this.className = data.className || 'Villager';
        this.color = data.color || 0xffffff;

        // Position & Stats
        this.x = data.x !== undefined ? data.x : 0;
        this.z = data.z !== undefined ? data.z : 0;
        this.level = data.level || 1;
        this.xp = data.xp || 0;

        // Inventory (Array of objects: { itemId, equipped })
        // If loaded as string (from DB), parse it.
        this.inventory = typeof data.inventory === 'string' ? JSON.parse(data.inventory) : (data.inventory || []);

        // Economy & Quests
        this.gold = data.gold || 0;
        this.quests = typeof data.quests === 'string' ? JSON.parse(data.quests) : (data.quests || {}); // { questId: { status: 'active'|'completed', progress: 0 } }

        // Calculate Max XP
        this.maxXp = 100;
        for (let i = 1; i < this.level; i++) {
            this.maxXp = Math.floor(this.maxXp * 1.5);
        }

        // Stats based on Class or Loaded Data
        const stats = Player.getClassStats(this.className);
        // Base Stats
        this.baseMaxHp = stats.hp;
        this.baseMaxMana = stats.mana;

        // Recalculate Totals with Equipment
        this.maxHp = this.baseMaxHp; // Init
        this.maxMana = this.baseMaxMana; // Init
        this.recalculateStats();

        this.hp = data.hp !== undefined ? data.hp : this.maxHp;
        this.mana = data.mana !== undefined ? data.mana : this.maxMana;

        // Cooldown tracking
        this.cooldowns = {};

        // Speed (4 units/sec base, adjusted by class speed factor)
        // 4 units/sec / 20 ticks = 0.2 base per tick
        this.speed = 0.2 * stats.speed;

        this.dead = false;
        this.respawnTimer = 0;
    }

    recalculateStats() {
        let addedHp = 0;
        this.inventory.forEach(item => {
            if (item.equipped) {
                const itemData = ItemSystem.getItem(item.itemId);
                if (itemData && itemData.stats) {
                    if (itemData.stats.hp) addedHp += itemData.stats.hp;
                }
            }
        });

        this.maxHp = this.baseMaxHp + addedHp;
        this.maxMana = this.baseMaxMana;

        if (this.hp > this.maxHp) this.hp = this.maxHp;
    }

    getDamage() {
        let baseDmg = 10;
        this.inventory.forEach(item => {
            if (item.equipped) {
                const itemData = ItemSystem.getItem(item.itemId);
                if (itemData && itemData.stats && itemData.stats.damage) {
                    baseDmg += itemData.stats.damage;
                }
            }
        });
        return baseDmg;
    }

    static getClassStats(className) {
        switch(className) {
            case 'Guerrier':
                return { hp: 150, mana: 30, speed: 1.0, color: 0xA52A2A }; // Red Brick
            case 'Ranger':
                return { hp: 90, mana: 40, speed: 1.2, color: 0x228B22 }; // Forest Green
            case 'Mage':
                return { hp: 80, mana: 100, speed: 1.0, color: 0x4169E1 }; // Royal Blue
            default:
                return { hp: 100, mana: 50, speed: 1.0, color: 0xffffff };
        }
    }

    takeDamage(amount) {
        if (this.dead) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            this.respawnTimer = Date.now() + 3000; // 3 seconds to respawn
        }
    }

    respawn() {
        if (this.dead && Date.now() > this.respawnTimer) {
            this.dead = false;
            this.hp = this.maxHp;
            this.mana = this.maxMana;
            this.cooldowns = {};
            this.x = 0;
            this.z = 0;
            return true;
        }
        return false;
    }

    gainXp(amount) {
        this.xp += amount;

        while (this.xp >= this.maxXp) {
            // Level Up
            this.xp -= this.maxXp;
            this.level++;
            this.maxXp = Math.floor(this.maxXp * 1.5); // Increase requirement

            // Restore stats
            this.hp = this.maxHp;
            this.mana = this.maxMana;

            return true; // Leveled up
        }
        return false;
    }

    handleInput(inputVector, world) {
        if (this.dead) return; // Dead players can't move
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
