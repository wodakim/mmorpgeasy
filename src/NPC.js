class NPC {
    constructor(id, type, name, x, z, dialogue) {
        this.id = id;
        this.type = type; // 'Merchant', 'Sage'
        this.name = name;
        this.x = x;
        this.z = z;
        this.dialogue = dialogue;
        // Color handled by client based on type
    }
}

module.exports = NPC;
