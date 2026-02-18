const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const gameLoop = require('./src/GameLoop');
const db = require('./src/Database');
const Player = require('./src/Player');
const ItemSystem = require('./src/ItemSystem');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Persistence Loop (Every 30s)
setInterval(() => {
    const players = gameLoop.players;
    for (const id in players) {
        const p = players[id];
        if (p.userId) {
            db.saveCharacter(p.userId, p).catch(console.error);
        }
    }
    console.log('Saved Game State');
}, 30000);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // NOTE: We do NOT add player to gameLoop immediately anymore.
    // Waiting for 'enterWorld' event.

    // 1. Login
    socket.on('login', async ({ username, password }) => {
        try {
            const user = await db.validateUser(username, password);
            if (user) {
                // Check if character exists
                const char = await db.getCharacter(user.id);
                socket.emit('loginSuccess', { userId: user.id, username: user.username, hasCharacter: !!char });
            } else {
                socket.emit('loginError', 'Invalid credentials');
            }
        } catch (e) {
            socket.emit('loginError', 'Server error');
        }
    });

    // 2. Register
    socket.on('register', async ({ username, password }) => {
        try {
            const user = await db.createUser(username, password);
            if (user.error) {
                socket.emit('registerError', user.error);
            } else {
                socket.emit('registerSuccess');
            }
        } catch (e) {
            socket.emit('registerError', 'Server error');
        }
    });

    // 3. Create Character
    socket.on('createCharacter', async ({ userId, name, className, color }) => {
        try {
            // Validate inputs?
            const stats = Player.getClassStats(className);
            const data = { name, className, skinColor: color, hp: stats.hp, maxHp: stats.hp, mana: stats.mana, maxMana: stats.mana };

            const char = await db.createCharacter(userId, data);
            if (char.error) {
                socket.emit('createCharacterError', char.error);
            } else {
                socket.emit('createCharacterSuccess');
            }
        } catch (e) {
            socket.emit('createCharacterError', 'Server error');
        }
    });

    // 4. Enter World
    socket.on('enterWorld', async ({ userId }) => {
        try {
            const char = await db.getCharacter(userId);
            if (char) {
                // Send initial world data first
                socket.emit('world', gameLoop.getWorldBlocks());

                // Add to Game Loop
                // Map DB row to Player data structure
                const playerData = {
                    userId: char.user_id,
                    username: char.name, // Display name
                    className: char.class,
                    color: char.skinColor,
                    x: char.x,
                    z: char.z,
                    hp: char.hp,
                    level: char.level,
                    xp: char.xp,
                    mana: char.mana
                };

                gameLoop.addPlayer(socket.id, playerData);

                // Notify Client
                socket.emit('enterWorldSuccess', {
                    id: socket.id,
                    ...playerData,
                    maxHp: gameLoop.getPlayer(socket.id).maxHp,
                    maxMana: gameLoop.getPlayer(socket.id).maxMana,
                    maxXp: gameLoop.getPlayer(socket.id).maxXp
                });
            }
        } catch (e) {
            console.error(e);
        }
    });

    // Handle movement input
    socket.on('move', (inputVector) => {
        gameLoop.handlePlayerInput(socket.id, inputVector);
    });

    // Handle Chat Message
    socket.on('chatMessage', (text) => {
        if (!text || typeof text !== 'string') return;
        const sanitizedText = text.substring(0, 200);
        io.emit('chatMessage', { id: socket.id, text: sanitizedText });
    });

    // Handle Attack
    socket.on('attack', (targetId) => {
        const player = gameLoop.getPlayer(socket.id);
        const mob = gameLoop.getMob(targetId);

        if (player && mob && !mob.dead) {
            const dist = Math.sqrt((player.x - mob.x)**2 + (player.z - mob.z)**2);
            if (dist < 5) {
                const damage = player.getDamage();
                const xpGained = mob.takeDamage(damage);
                io.emit('damage', { targetId: mob.id, amount: damage, x: mob.x, z: mob.z });

                if (xpGained > 0) {
                    const leveledUp = player.gainXp(xpGained);
                    if (leveledUp) {
                        io.emit('chatMessage', { id: 'SYSTEM', text: `NIVEAU UP ! ${player.username} est niveau ${player.level}` });
                        // Save immediately on Level Up
                        if (player.userId) db.saveCharacter(player.userId, player);
                    }
                }
            }
        }
    });

    // Handle Pickup Loot
    socket.on('pickup', (lootId) => {
        const player = gameLoop.getPlayer(socket.id);
        const loot = gameLoop.loot[lootId]; // Access from GameLoop state directly?
        // GameLoop doesn't expose loot object publicly in a clean way except via getter or direct property access if module allows.
        // GameLoop exports an instance. We can access .loot if it's public.
        // Checking GameLoop.js: this.loot = {} is in constructor.

        if (player && loot) {
             const dist = Math.sqrt((player.x - loot.x)**2 + (player.z - loot.z)**2);
             if (dist < 3) {
                 const item = ItemSystem.getItem(loot.itemId);
                 if (item) {
                     // Add to inventory (parse string if needed? No, logic in Player handles it as array)
                     player.inventory.push({ itemId: item.id, equipped: false });
                     gameLoop.removeLoot(lootId); // Helper added in previous step

                     socket.emit('chatMessage', { id: 'SYSTEM', text: `You picked up ${item.name}` });
                     if (player.userId) db.saveCharacter(player.userId, player);
                 }
             }
        }
    });

    // Handle Use Item (Equip/Consume)
    socket.on('useItem', (index) => {
        const player = gameLoop.getPlayer(socket.id);
        if (player && player.inventory[index]) {
            const entry = player.inventory[index];
            const item = ItemSystem.getItem(entry.itemId);

            if (item.type === 'potion') {
                if (item.stats.heal) {
                    player.hp = Math.min(player.hp + item.stats.heal, player.maxHp);
                    player.inventory.splice(index, 1);
                }
            } else if (item.type === 'weapon' || item.type === 'armor') {
                if (entry.equipped) {
                    entry.equipped = false;
                } else {
                    player.inventory.forEach(i => {
                        const d = ItemSystem.getItem(i.itemId);
                        if (d.type === item.type) i.equipped = false;
                    });
                    entry.equipped = true;
                }
                player.recalculateStats();
            }
            if (player.userId) db.saveCharacter(player.userId, player);
        }
    });

    // Handle Skill
    socket.on('skill', (input) => {
        // Input: { dx, dz }
        gameLoop.castSpell(socket.id, input);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Save before remove
        const player = gameLoop.getPlayer(socket.id);
        if (player && player.userId) {
            db.saveCharacter(player.userId, player).then(() => {
                console.log(`Saved data for ${player.username}`);
            });
        }

        gameLoop.removePlayer(socket.id);
    });
});

// Start the game loop
gameLoop.start(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
