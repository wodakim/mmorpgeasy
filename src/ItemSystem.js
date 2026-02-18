const ITEMS = {
    'rusty_sword': {
        id: 'rusty_sword',
        name: 'Épée Rouillée',
        type: 'weapon',
        stats: { damage: 5 },
        icon: '#7f8c8d' // Grey
    },
    'leather_tunic': {
        id: 'leather_tunic',
        name: 'Tunique en Cuir',
        type: 'armor',
        stats: { hp: 20 },
        icon: '#8e44ad' // Purple? Leather is usually brown, let's use #d35400 (pumpkin/brownish)
    },
    'health_potion': {
        id: 'health_potion',
        name: 'Potion de Soin',
        type: 'potion',
        stats: { heal: 50 },
        icon: '#e74c3c' // Red
    }
};

class ItemSystem {
    getItem(id) {
        return ITEMS[id];
    }

    // Starting items for new characters?
    getStartingItems(className) {
        return ['rusty_sword', 'health_potion'];
    }
}

module.exports = new ItemSystem();
