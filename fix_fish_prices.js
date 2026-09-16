const sqlite = require('better-sqlite3');
const path = require('path');
const d = new sqlite(path.join(__dirname, 'database.sqlite'));

const fishRows = d.prepare('SELECT id, tier FROM fish').all();
for (const fish of fishRows) {
    const t = fish.tier;
    let basePrice = Math.floor(50 * Math.pow(t, 2.3) + Math.random() * (t * 20));
    if (t === 1) basePrice = 40 + Math.floor(Math.random() * 40);
    if (t === 2) basePrice = 100 + Math.floor(Math.random() * 80);
    if (t === 3) basePrice = 200 + Math.floor(Math.random() * 150);
    if (t === 4) basePrice = 400 + Math.floor(Math.random() * 250);
    if (t === 5) basePrice = 700 + Math.floor(Math.random() * 400);
    if (t === 6) basePrice = 1200 + Math.floor(Math.random() * 600);
    if (t === 7) basePrice = 2000 + Math.floor(Math.random() * 1000);
    if (t === 8) basePrice = 3500 + Math.floor(Math.random() * 1500);
    if (t === 9) basePrice = 6000 + Math.floor(Math.random() * 2500);
    if (t === 10) basePrice = 10000 + Math.floor(Math.random() * 5000);
    if (t === 11) basePrice = 25000 + Math.floor(Math.random() * 10000);

    d.prepare('UPDATE fish SET price_per_kg = ? WHERE id = ?').run(basePrice, fish.id);
}

console.log('✅ Fish prices perfectly re-balanced!');
d.close();
