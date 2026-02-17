const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const gameLoop = require('./src/GameLoop');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send world data to the new player
    socket.emit('world', gameLoop.getWorldBlocks());

    // Add new player to the game loop
    gameLoop.addPlayer(socket.id);

    // Handle movement input
    socket.on('move', (inputVector) => {
        gameLoop.handlePlayerInput(socket.id, inputVector);
    });

    // Handle Chat Message
    socket.on('chatMessage', (text) => {
        if (!text || typeof text !== 'string') return;

        // Basic sanitization: truncate to 200 chars
        const sanitizedText = text.substring(0, 200);

        // Broadcast to all clients
        io.emit('chatMessage', { id: socket.id, text: sanitizedText });
    });

    // Handle Attack
    socket.on('attack', (targetId) => {
        const player = gameLoop.getPlayer(socket.id);
        const mob = gameLoop.getMob(targetId);

        if (player && mob && !mob.dead) {
            // Distance Check
            const dist = Math.sqrt((player.x - mob.x)**2 + (player.z - mob.z)**2);
            if (dist < 5) {
                // Apply Damage
                const damage = 10;
                const xpGained = mob.takeDamage(damage);

                // Broadcast Damage (Floating Text)
                io.emit('damage', { targetId: mob.id, amount: damage, x: mob.x, z: mob.z });

                // Handle Kill / XP
                if (xpGained > 0) {
                    const leveledUp = player.gainXp(xpGained);
                    if (leveledUp) {
                        io.emit('chatMessage', { id: 'SYSTEM', text: `NIVEAU UP ! ${socket.id.substring(0,5)} est niveau ${player.level}` });
                    }
                }
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        gameLoop.removePlayer(socket.id);
    });
});

// Start the game loop
gameLoop.start(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
