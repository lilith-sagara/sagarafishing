const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const eventFish = [
    ['Archangel Michael Fish', 12, 'Angel & Demon', '⚔️👼', 'Ikan Malaikat Agung Michael.', 1000000000, 1000.0, 5000.0, 1],
    ['Gabriel Seraphim Bass', 12, 'Angel & Demon', '🎺✨', 'Ikan bersuara terompet surga.', 1200000000, 1200.0, 6000.0, 1],
    ['Uriel Flame Salmon', 12, 'Angel & Demon', '🔥👼', 'Ikan api penghakiman suci.', 1500000000, 1500.0, 7000.0, 1],
    ['Metatron Cosmic Carp', 12, 'Angel & Demon', '☸️✨', 'Ikan pembawa kubus suci.', 2000000000, 2000.0, 8000.0, 1],
    ['Lucifer Morningstar Shark', 12, 'Angel & Demon', '🔱😈', 'Hiu iblis Bintang Fajar.', 2500000000, 2500.0, 9000.0, 1],
    ['Beelzebub Fly Whale', 12, 'Angel & Demon', '🪰🐋', 'Paus Lalat penguasa kerakusan.', 3000000000, 3000.0, 10000.0, 1],
    ['Asmodeus Lust Eel', 12, 'Angel & Demon', '🐍💋', 'Belut iblis pemikat jiwa.', 3500000000, 3500.0, 11000.0, 1],
    ['Leviathan Envy Kraken', 12, 'Angel & Demon', '🐙🌊', 'Kraken iblis dengki dari kedalaman.', 4000000000, 4000.0, 12000.0, 1],
    ['Satan Wrath Leviathan', 12, 'Angel & Demon', '🔥🐉', 'Naga kemurkaan neraka tertinggi.', 5000000000, 5000.0, 15000.0, 1]
];

const insertFish = db.prepare(`
    INSERT INTO fish (name, tier, tier_name, emoji, description, price_per_kg, weight_min, weight_max, rarity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

eventFish.forEach(data => {
    const exist = db.prepare('SELECT id FROM fish WHERE name = ?').get(data[0]);
    if (!exist) {
        insertFish.run(...data);
        console.log(`+ Ikan Event: ${data[0]}`);
    }
});
db.close();
console.log('✅ 9 Ikan Angel & Demon Berhasil Ditambahkan!');
