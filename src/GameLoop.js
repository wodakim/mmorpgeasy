const Player = require('./Player');
const World = require('./World');
const Constants = require('./Constants');
const Mob = require('./Mob');
const SpellSystem = require('./SpellSystem');
const NPC = require('./NPC');

class GameLoop {
    constructor() {
        this.players = {};
        this.playerInputs = {};
        this.mobs = {};
        this.npcs = {}; // { id: NPC }
        this.projectiles = []; // Active projectiles
        this.interval = null;
        this.TICK_RATE = Constants.TICK_RATE;
        this.TICK_TIME = 1000 / this.TICK_RATE;
        this.regenTimer = 0;
        this.pendingEffects = [];
        this.loot = {}; // { id: { x, z, itemId } }
        this.nextLootId = 0;

        this.initMobs();
        this.initNPCs();
    }

    initNPCs() {
        this.npcs['merchant'] = new NPC('merchant', 'Merchant', 'Marchand', 2, 2, "Bienvenue dans ma boutique !");
        this.npcs['sage'] = new NPC('sage', 'Sage', 'Vieux Sage', -2, 2, "J'ai une mission pour toi.");
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
        const now = Date.now();
        const deltaTime = this.TICK_TIME / 1000;

        // Passive Regen (Every 2 seconds)
        if (now > this.regenTimer) {
            this.regenTimer = now + 2000;
            for (const id in this.players) {
                const p = this.players[id];
                if (!p.dead) {
                    if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, Math.floor(p.hp + p.maxHp * 0.05));
                    if (p.mana < p.maxMana) p.mana = Math.min(p.maxMana, Math.floor(p.mana + p.maxMana * 0.05));
                }
            }
        }

        // Update Projectiles
        const projResult = SpellSystem.updateProjectiles(this.projectiles, this.mobs, deltaTime);
        this.projectiles = projResult.projectiles;

        // Handle Projectile Events (Damage, Explosions)
        for (const event of projResult.events) {
            if (event.type === 'damage') {
                const mob = this.mobs[event.targetId];
                if (mob && !mob.dead) {
                    mob.takeDamage(event.damage);
                    this.pendingEffects.push({ type: 'damage', x: mob.x, z: mob.z, amount: event.damage });
                }
            } else if (event.type === 'effect') {
                this.pendingEffects.push(event); // Store for broadcast
            }
        }

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
                if (!mob.lootDropped) {
                    // Drop Loot Chance (e.g. 50%)
                    if (Math.random() < 0.5) {
                        const lootId = `loot_${this.nextLootId++}`;
                        // Random item? Or simple specific item?
                        // Let's drop a 'health_potion' or 'rusty_sword' randomly
                        const items = ['health_potion', 'rusty_sword', 'leather_tunic'];
                        const item = items[Math.floor(Math.random() * items.length)];

                        this.loot[lootId] = { id: lootId, x: mob.x, z: mob.z, itemId: item };
                        // Broadcast creation logic is implicit via state sync
                    }
                    mob.lootDropped = true;
                }

                if (Date.now() > mob.respawnTimer) {
                    mob.respawn();
                    mob.lootDropped = false;
                }
            } else {
                // AI Update
                const action = mob.update(this.players, World);
            }
        }
    }

    // Add pendingEffects queue
    initEffectsQueue() {
        this.pendingEffects = [];
    }

    broadcast(io) {
        // Send State
        io.emit('state', {
            players: this.players,
            mobs: this.mobs,
            projectiles: this.projectiles,
            loot: this.loot,
            npcs: this.npcs
        });

        // Flush Effects (One-shot events like Explosions, Hits)
        if (this.pendingEffects && this.pendingEffects.length > 0) {
            io.emit('effects', this.pendingEffects);
            this.pendingEffects = [];
        }
    }

    addPlayer(id, data) {
        this.players[id] = new Player(id, data);
        console.log(`Player ${id} added (Level ${this.players[id].level} ${this.players[id].className})`);
        if (!this.pendingEffects) this.initEffectsQueue();
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

    removeLoot(id) {
        delete this.loot[id];
    }

    castSpell(playerId, input) {
        const player = this.players[playerId];
        if (!player || player.dead) return;

        const result = SpellSystem.cast(player, input);
        if (!result || result.error) return; // Handle error (maybe send back to client?)

        if (result.type === 'projectile') {
            this.projectiles.push(result.projectile);
        } else if (result.type === 'aoe') {
            // Instant AOE logic
            this.pendingEffects.push({ type: 'effect', name: 'whirlwind', x: player.x, z: player.z, radius: result.radius });

            // Apply Damage
            const hits = SpellSystem.resolveAoE(result, this.mobs);
            hits.forEach(hit => {
                const mob = this.mobs[hit.targetId];
                if (mob && !mob.dead) {
                    mob.takeDamage(hit.damage);
                    // We could add damage text effect here if we want
                    this.pendingEffects.push({ type: 'damage_text', x: mob.x, z: mob.z, amount: hit.damage });
                }
            });
        }
    }
}

module.exports = new GameLoop();
