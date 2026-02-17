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
