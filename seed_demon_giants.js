const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const fishCols = db.prepare('PRAGMA table_info(fish)').all().map(c => c.name);
if (!fishCols.includes('is_giant')) {
    db.exec('ALTER TABLE fish ADD COLUMN is_giant INTEGER DEFAULT 0');
}

const nerf = db.prepare('UPDATE fish SET price_per_kg = ? WHERE tier = 12 AND COALESCE(is_giant, 0) = 0');
const r = nerf.run(300);
console.log(`⚖️  Nerf harga ikan Angel & Demon (tier 12) → 1-2 Juta/ikan (${r.changes} baris)`);

const newFishData = [
    // 15 ikan Demon normal (harga ±1-2 Juta)
    ['Harbinger Angelfish', 12, 'Angel & Demon', '👼', 'Pembawa petunjuk datangnya malaikat maut laut.', 300, 1500.0, 4000.0, 1],
    ['Cherubim Shade Bass', 12, 'Angel & Demon', '😇', 'Ikan suci yang menyimpan bayangan di siripnya.', 300, 1200.0, 3800.0, 1],
    ['Seraph Tears Koi', 12, 'Angel & Demon', '💧', 'Air matanya dipercaya sebagai obat kehidupan.', 300, 2000.0, 5000.0, 1],
    ['Ophanim Wheel Eel', 12, 'Angel & Demon', '⚙️', 'Belut yang siripnya berputar seperti roda surga.', 300, 1000.0, 3500.0, 1],
    ['Dominion Halo Ray', 12, 'Angel & Demon', '👑', 'Cahaya halo di punggungnya menyilaukan para iblis.', 300, 2500.0, 5500.0, 1],
    ['Virtue Luminous Jelly', 12, 'Angel & Demon', '✨', 'Ubur-ubur dari taman cahaya para Kebajikan.', 300, 800.0, 2000.0, 1],
    ['Principalities Guardfish', 12, 'Angel & Demon', '🛡️', 'Penjaga gerbang yang tak pernah tidur.', 300, 3000.0, 6500.0, 1],
    ['Azazel Fallen Pike', 12, 'Angel & Demon', '🕯️', 'Tombak laut dari malaikat yang jatuh.', 300, 1500.0, 4500.0, 1],
    ['Belphegor Sloth Snapper', 12, 'Angel & Demon', '😴', 'Ikan malas yang tertidur di dasar jurang.', 300, 2000.0, 6000.0, 1],
    ['Mammon Greed Puffer', 12, 'Angel & Demon', '💰', 'Menelan kekayaan kapal-kapal yang karam.', 300, 1200.0, 4000.0, 1],
    ['Abaddon Pit Viperfish', 12, 'Angel & Demon', '🐍', 'Predator jurang tanpa dasar yang menelan cahaya.', 300, 1800.0, 5000.0, 1],
    ['Amon Wrath Barracuda', 12, 'Angel & Demon', '🔥', 'Gigi emasnya membara karena amarah abadi.', 300, 2500.0, 7000.0, 1],
    ['Belial Worthless Goby', 12, 'Angel & Demon', '🦴', 'Ikan cilik yang menyesatkan penjaga neraka.', 300, 1000.0, 3000.0, 1],
    ['Mephisto Night Skate', 12, 'Angel & Demon', '🌑', 'Bayangan malam yang meluncur tanpa suara.', 300, 3000.0, 8000.0, 1],
    ['Lucifuge Deep Lamprey', 12, 'Angel & Demon', '🩸', 'Penghisap yang menempel di dasar lautan neraka.', 300, 1300.0, 4200.0, 1],
    // 3 Ikan GIANT langka (nilai ±1 Triliun)
    ['Giant Behemoth Kraken', 12, 'Angel & Demon', '🐙', 'RAKSASA jurang yang mengguncang fondasi neraka saat terbangun.', 250000000, 4000.0, 5000.0, 1],
    ['Giant Seraph Dragonfish', 12, 'Angel & Demon', '🐲', 'RAKSASA penjaga surga, satu kepakan siripnya memecah lautan.', 250000000, 4000.0, 5000.0, 1],
    ['Giant Nyx Shadow Whale', 12, 'Angel & Demon', '🐋', 'RAKSASA malam pembawa kegelapan, tak pernah terlihat sejak awal zaman.', 250000000, 4000.0, 5000.0, 1]
];

const insertFish = db.prepare(`
    INSERT INTO fish (name, tier, tier_name, emoji, description, price_per_kg, weight_min, weight_max, rarity, is_giant)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let added = 0;
const tx = db.transaction(() => {
    newFishData.forEach(d => {
        const isGiant = d[0].startsWith('Giant ') ? 1 : 0;
        const exist = db.prepare('SELECT id FROM fish WHERE name = ?').get(d[0]);
        if (!exist) {
            insertFish.run(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], isGiant);
            console.log(`+ ${isGiant ? '🐉 GIANT' : 'Ikan'}: ${d[0]}`);
            added++;
        }
    });
});
tx();
db.close();
console.log(`✅ Selesai. ${added} ikan baru (3 Giant) ditambahkan.`);