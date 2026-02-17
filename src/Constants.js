const Constants = {
    TICK_RATE: 20,
    PLAYER_SPEED: 4, // Units per second
    MAP_SIZE: 50,
    BLOCK_SIZE: 1,
    COLORS: {
        GRASS: 0x57D066,
        WATER: 0x4FB4E6,
        STONE: 0x6F7887,
        SKY: 0x87CEEB,
        FOG: 0x87CEEB,
        MOB: 0xFF0000 // Red
    },
    XP_BASE: 100,
    XP_FACTOR: 1.5,
    MOB_XP: 20,
    MOB_RESPAWN_TIME: 5000 // 5 seconds
};

module.exports = Constants;
