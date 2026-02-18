const Constants = require('./Constants');

const SPELLS = {
    'Mage': {
        name: 'Fireball',
        cost: 20,
        cooldown: 3000,
        damage: 40,
        range: 15,
        speed: 10,
        type: 'projectile',
        color: 0xFF0000,
        radius: 0.5,
        splashRadius: 3 // Explosion radius
    },
    'Ranger': {
        name: 'Piercing Arrow',
        cost: 15,
        cooldown: 5000,
        damage: 25,
        range: 20,
        speed: 20,
        type: 'projectile',
        piercing: true,
        color: 0x00FF00,
        radius: 0.3
    },
    'Guerrier': {
        name: 'Whirlwind',
        cost: 10,
        cooldown: 4000,
        damage: 30,
        range: 3,
        type: 'instant_aoe',
        color: 0xFFFFFF
    }
};

class SpellSystem {
    constructor() {
        this.nextProjectileId = 0;
    }

    getSpell(className) {
        return SPELLS[className];
    }

    cast(player, input) {
        const spell = this.getSpell(player.className);
        if (!spell) return { error: 'Unknown Class' };

        const now = Date.now();

        // Cooldown
        if (player.cooldowns['skill_2'] && now < player.cooldowns['skill_2']) {
            return { error: 'Cooldown' };
        }

        // Mana
        if (player.mana < spell.cost) {
            return { error: 'No Mana' };
        }

        // Apply Cost & Cooldown
        player.mana -= spell.cost;
        player.cooldowns['skill_2'] = now + spell.cooldown;

        if (spell.type === 'projectile') {
            let dx = input.dx || 0;
            let dz = input.dz || 0;
            const len = Math.sqrt(dx*dx + dz*dz);
            if (len === 0) { dx = 1; dz = 0; } // Fallback

            const normalizedDx = dx / (len || 1);
            const normalizedDz = dz / (len || 1);

            const proj = {
                id: `proj_${this.nextProjectileId++}`,
                ownerId: player.id,
                x: player.x,
                z: player.z,
                vx: normalizedDx * spell.speed,
                vz: normalizedDz * spell.speed,
                damage: spell.damage,
                range: spell.range,
                distanceTraveled: 0,
                name: spell.name,
                color: spell.color,
                piercing: spell.piercing || false,
                hitList: [],
                radius: spell.radius,
                splashRadius: spell.splashRadius || 0
            };
            return { type: 'projectile', projectile: proj, cooldown: spell.cooldown };
        } else if (spell.type === 'instant_aoe') {
            return {
                type: 'aoe',
                damage: spell.damage,
                radius: spell.range,
                x: player.x,
                z: player.z,
                ownerId: player.id,
                cooldown: spell.cooldown,
                name: spell.name
            };
        }
    }

    updateProjectiles(projectiles, mobs, deltaTime) {
        const events = []; // { type: 'damage'|'effect', targetId?, damage?, x?, z?, effectType? }
        const keptProjectiles = [];

        for (const p of projectiles) {
            // Move
            const moveDist = Math.sqrt(p.vx*p.vx + p.vz*p.vz) * deltaTime;
            p.x += p.vx * deltaTime;
            p.z += p.vz * deltaTime;
            p.distanceTraveled += moveDist;

            let hit = false;
            let remove = false;
            let explode = false;

            // Check Collision with Mobs
            for (const mobId in mobs) {
                const mob = mobs[mobId];
                if (mob.dead) continue;
                if (p.piercing && p.hitList.includes(mobId)) continue;

                const dx = p.x - mob.x;
                const dz = p.z - mob.z;
                const dist = Math.sqrt(dx*dx + dz*dz);

                if (dist < (0.8 + p.radius)) { // Mob size approx 0.8
                    // Direct Hit
                    if (p.splashRadius > 0) {
                        explode = true; // Trigger explosion logic below
                        hit = true;
                        remove = true;
                        break;
                    } else {
                        // Single Target or Piercing
                        events.push({ type: 'damage', targetId: mobId, damage: p.damage });
                        if (p.piercing) {
                            p.hitList.push(mobId);
                            hit = true;
                        } else {
                            hit = true;
                            remove = true;
                            events.push({ type: 'effect', name: 'hit', x: p.x, z: p.z });
                            break;
                        }
                    }
                }
            }

            // Max Range
            if (!remove && p.distanceTraveled >= p.range) {
                remove = true;
                if (p.splashRadius > 0) explode = true;
            }

            // Handle Explosion (Fireball)
            if (explode) {
                events.push({ type: 'effect', name: 'explosion', x: p.x, z: p.z });
                // Splash Damage
                for (const mobId in mobs) {
                    const mob = mobs[mobId];
                    if (mob.dead) continue;
                    const dx = p.x - mob.x;
                    const dz = p.z - mob.z;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist <= p.splashRadius) {
                         events.push({ type: 'damage', targetId: mobId, damage: p.damage });
                    }
                }
            }

            if (!remove) {
                keptProjectiles.push(p);
            }
        }

        return { projectiles: keptProjectiles, events };
    }

    resolveAoE(aoe, mobs) {
        const hits = [];
        for (const mobId in mobs) {
            const mob = mobs[mobId];
            if (mob.dead) continue;
            const dx = aoe.x - mob.x;
            const dz = aoe.z - mob.z;
            const dist = Math.sqrt(dx*dx + dz*dz);

            if (dist <= aoe.radius) {
                hits.push({ targetId: mobId, damage: aoe.damage });
            }
        }
        return hits;
    }
}

module.exports = new SpellSystem();
