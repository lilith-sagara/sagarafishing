const db = require('./database');
const { RODS } = require('./keyboards');

// 6 Malaikat & 6 Iblis
const BOT_NAMES = [
    'Gabriel 👼', 'Michael ⚔️', 'Raphael 🛡️', 'Uriel ⚖️', 'Azrael 💀', 'Jophiel ✨',
    'Lucifer 🔱', 'Beelzebub 🪰', 'Mammon 💰', 'Asmodeus 💖', 'Leviathan 🐍', 'Belphegor 💤'
];

const BOT_ID_START = 900000;

async function simulateFishing(botId, botName) {
    try {
        const user = db.getOrCreateUser(botId, botName);
        const rod = RODS.find(r => r.tier === user.rod_tier) || RODS[0];
        
        const fish = db.getRandomFishByTier(user.rod_tier, user.luck);
        
        if (fish) {
            const weight = Math.random() * (fish.weight_max - fish.weight_min) + fish.weight_min;
            const price = Math.floor(weight * fish.price_per_kg);
            const expGain = Math.floor(weight * 10 * (fish.tier / 2));

            const fishId = db.addInventory(botId, fish.id, weight.toFixed(1));
            db.updateCoins(botId, price);
            db.updateExp(botId, expGain);
            db.incrementCatches(botId);
            db.updateMaxWeight(botId, weight);
            
            const nextRod = RODS.find(r => r.tier === user.rod_tier + 1);
            if (nextRod && user.coins >= nextRod.price) {
                db.updateRodTier(botId, nextRod.tier);
                db.updateCoins(botId, -nextRod.price);
            }

            const expNeeded = 100 * (user.level ** 1.5);
            if (user.exp + expGain >= expNeeded) {
                db.updateLevel(botId, user.level + 1);
            }

            // AI Logic: Langsung pajang jika memenuhi syarat
            const currentAq = db.getUserAquarium(botId);
            if (currentAq.length < 3) {
                db.addToAquarium(botId, fishId);
            } else {
                const worstAqFish = currentAq.sort((a, b) => (a.tier * 1000 + a.weight) - (b.tier * 1000 + b.weight))[0];
                if ((fish.tier * 1000 + weight) > (worstAqFish.tier * 1000 + worstAqFish.weight)) {
                    db.removeFromAquarium(botId, worstAqFish.inv_id);
                    db.addToAquarium(botId, fishId);
                }
            }
        }
        
        const nextDelay = (rod.cooldown * 1000) + (Math.random() * 50000 + 10000);
        setTimeout(() => simulateFishing(botId, botName), nextDelay);
        
    } catch (e) {
        console.error(`[AI ERROR] ${botName}:`, e.message);
    }
}

function startPhantomAnglers() {
    console.log(`🤖 Mengaktifkan 12 Malaikat & Iblis Phantom Anglers...`);
    BOT_NAMES.forEach((name, index) => {
        const botId = BOT_ID_START + index;
        setTimeout(() => simulateFishing(botId, name), Math.random() * 60000);
    });
}

module.exports = { startPhantomAnglers };
