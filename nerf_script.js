const sqlite = require('better-sqlite3');
const path = require('path');
const d = new sqlite(path.join(__dirname, 'database.sqlite'));

// 1. Nerf InoMC / top users to 6 Trillion max
d.prepare("UPDATE users SET coins = 6000000000000 WHERE coins > 6000000000000").run();
console.log('✅ Users with coins > 6 Trillion nerfed to 6 Trillion!');

// 2. Nerf Fish Prices (Max 4 Million for Tier 11)
const fishList = d.prepare('SELECT id, tier FROM fish').all();
for (const fish of fishList) {
    const tier = fish.tier;
    let newPrice = Math.floor(Math.pow(tier, 3) * 3000 + (Math.random() * 10000));
    
    if (tier === 1) newPrice = 50 + Math.floor(Math.random() * 100);
    if (tier >= 11) newPrice = 3500000 + Math.floor(Math.random() * 500000);
    
    d.prepare('UPDATE fish SET price_per_kg = ? WHERE id = ?').run(newPrice, fish.id);
}

console.log('✅ All fish prices in database.sqlite nerfed! Tier 11 capped at ~4M.');
d.close();
