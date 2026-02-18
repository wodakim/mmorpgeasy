const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../aestheria.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        name TEXT UNIQUE,
        class TEXT,
        skinColor INTEGER,
        level INTEGER,
        xp INTEGER,
        hp INTEGER,
        maxHp INTEGER,
        mana INTEGER,
        maxMana INTEGER,
        x REAL,
        z REAL,
        inventory TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

class Database {

    // --- User Auth ---

    createUser(username, password) {
        return new Promise(async (resolve, reject) => {
            try {
                const hash = await bcrypt.hash(password, 10);
                db.run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, hash], function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            resolve({ error: 'Username already exists' });
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve({ id: this.lastID, username });
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    validateUser(username, password) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);

                const match = await bcrypt.compare(password, row.password_hash);
                if (match) {
                    resolve({ id: row.id, username: row.username });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // --- Character Management ---

    getCharacter(userId) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM characters WHERE user_id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    createCharacter(userId, data) {
        return new Promise((resolve, reject) => {
            const { name, className, skinColor, hp, maxHp, mana, maxMana, inventory } = data;
            const stmt = `INSERT INTO characters (user_id, name, class, skinColor, level, xp, hp, maxHp, mana, maxMana, x, z, inventory)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            // Default Spawn: 0, 0. Level 1. XP 0.
            const values = [userId, name, className, skinColor, 1, 0, hp, maxHp, mana, maxMana, 0, 0, inventory || '[]'];

            db.run(stmt, values, function(err) {
                if (err) {
                    console.error('SQL Error during createCharacter:', err); // Explicit Log
                    if (err.message.includes('UNIQUE constraint failed')) {
                        resolve({ error: 'Character name already taken' });
                    } else {
                        reject(err);
                    }
                } else {
                    resolve({ id: this.lastID, ...data, level: 1, xp: 0, x: 0, z: 0, inventory: inventory || '[]' });
                }
            });
        });
    }

    saveCharacter(userId, data) {
        return new Promise((resolve, reject) => {
            const stmt = `UPDATE characters SET level = ?, xp = ?, hp = ?, x = ?, z = ?, inventory = ? WHERE user_id = ?`;
            // Note: We don't save maxHp/maxMana/class constantly as they are derived/static usually,
            // but for level ups we might want to save everything.
            // For MVP persistence: Level, XP, Position, Current HP, Inventory.
            const invString = JSON.stringify(data.inventory || []);
            db.run(stmt, [data.level, data.xp, data.hp, data.x, data.z, invString, userId], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }
}

module.exports = new Database();
