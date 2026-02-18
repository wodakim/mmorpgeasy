const QUESTS = {
    'clean_up': {
        id: 'clean_up',
        name: 'Nettoyage',
        objective: 'kill_mob', // type
        target: 'any_mob', // for now, or specific ID
        count: 5,
        reward: { gold: 50, xp: 100 },
        text: "Les cubes rouges envahissent la vallée. Débarrassez-nous en de 5."
    }
};

class QuestSystem {
    getQuest(id) {
        return QUESTS[id];
    }

    checkProgress(player, eventType, targetId) {
        // Iterate active quests
        for (const qId in player.quests) {
            const qState = player.quests[qId];
            if (qState.status !== 'active') continue;

            const questDef = QUESTS[qId];
            if (!questDef) continue;

            if (questDef.objective === 'kill_mob' && eventType === 'kill') {
                // If target specific? Assuming any mob for now or check targetId
                qState.progress++;
                if (qState.progress >= questDef.count) {
                    // Ready to turn in
                    // qState.status = 'ready'; // Or auto complete? Let's require turn in.
                }
                return { questId: qId, progress: qState.progress, max: questDef.count };
            }
        }
        return null;
    }
}

module.exports = new QuestSystem();
