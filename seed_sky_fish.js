const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const newFishData = [
    // Tier 8: Celestial
    ['Sunbeam Koi', 8, 'Celestial', '☀️', 'Ikan yang berenang di pantulan sinar matahari murni.', 150000, 50.0, 150.0, 1],
    ['Stardust Guppy', 8, 'Celestial', '✨', 'Tubuhnya terbuat dari serpihan bintang jatuh.', 180000, 10.0, 40.0, 1],
    ['Aurora Jellyfish', 8, 'Celestial', '🌌', 'Ubur-ubur yang memancarkan cahaya aurora utara.', 220000, 20.0, 80.0, 1],
    ['Comet Ray', 8, 'Celestial', '☄️', 'Pari langit yang bergerak secepat komet.', 250000, 60.0, 200.0, 1],
    ['Supernova Bass', 8, 'Celestial', '💥', 'Ikan hasil ledakan bintang kuno.', 300000, 100.0, 300.0, 1],

    // Tier 9: Cosmic
    ['Nebula Eel', 9, 'Cosmic', '🪐', 'Belut luar angkasa yang menyerap gas nebula.', 500000, 80.0, 250.0, 1],
    ['Blackhole Angler', 9, 'Cosmic', '🕳️', 'Umpannya menarik semua partikel materi di sekitarnya.', 750000, 150.0, 450.0, 1],
    ['Galaxy Shark', 9, 'Cosmic', '🌌🦈', 'Hiu kosmik pemangsa planet kecil.', 1000000, 300.0, 800.0, 1],
    ['Pulsar Marlin', 9, 'Cosmic', '💫', 'Moncongnya memancarkan radiasi elektromagnetik kuat.', 1250000, 200.0, 600.0, 1],
    ['Solar Flare Trout', 9, 'Cosmic', '🔥', 'Sangat panas hingga membakar air di sekitarnya.', 1500000, 120.0, 350.0, 1],
    ['Dark Matter Crab', 9, 'Cosmic', '🦀', 'Kepiting tak kasat mata dari materi gelap.', 2000000, 50.0, 180.0, 1],

    // Tier 10: Primordial
    ['Genesis Whale', 10, 'Primordial', '🐋✨', 'Paus purba yang ada sebelum alam semesta terbentuk.', 5000000, 1000.0, 3500.0, 1],
    ['Chaos Serpent', 10, 'Primordial', '🐉🌀', 'Ular perusak realitas.', 6500000, 800.0, 2800.0, 1],
    ['Time-Weaver Salmon', 10, 'Primordial', '⏳', 'Berenang bolak-balik melintasi garis waktu.', 8000000, 250.0, 900.0, 1],
    ['Void Leech', 10, 'Primordial', '👁️', 'Lintah dimensi yang menghisap ruang hampa.', 10000000, 400.0, 1200.0, 1],
    ['Infinity Ray', 10, 'Primordial', '♾️', 'Sayapnya membentang tak terbatas.', 12500000, 1500.0, 5000.0, 1],
    ['Eternal Octopus', 10, 'Primordial', '🐙⏳', 'Gurita abadi dengan 8 tentakel realitas.', 15000000, 2000.0, 6500.0, 1],
    ['Alpha & Omega Carp', 10, 'Primordial', '☯️', 'Awal dan akhir dari segala jenis ikan.', 20000000, 300.0, 1000.0, 1],

    // Tier 11: The Sky
    ['Aetherial Dragonfish', 11, 'The Sky', '☁️🐉', 'Naga langit yang hidup di atas awan tertinggi.', 50000000, 3000.0, 9999.0, 1],
    ['Sky-Lord Garuda', 11, 'The Sky', '🦅🌊', 'Penguasa langit dan lautan tak bertepi.', 75000000, 4000.0, 12000.0, 1],
    ['Firmament Colossus', 11, 'The Sky', '🏛️🐟', 'Ikan sebesar kubah langit yang menopang dunia.', 100000000, 8000.0, 25000.0, 1],
    ['Lucifer\'s Fallen Ray', 11, 'The Sky', '🔱⚡', 'Pari yang jatuh dari surga tertinggi.', 150000000, 5000.0, 18000.0, 1],
    ['Seraphim Fish', 11, 'The Sky', '👼✨', 'Memiliki 6 sayap cahaya suci.', 200000000, 2000.0, 7000.0, 1],
    ['Zim\'s Heavenly Leviathan', 11, 'The Sky', '👑🐍', 'Leviathan penjaga tahta langit Sagara.', 350000000, 10000.0, 40000.0, 1],
    ['God-Slayer Sagara Koi', 11, 'The Sky', '🌌👑', 'Ikan mutlak pemegang takdir samudera.', 500000000, 15000.0, 50000.0, 1]
];

const insertFish = db.prepare(`
    INSERT INTO fish (name, tier, tier_name, emoji, description, price_per_kg, weight_min, weight_max, rarity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

newFishData.forEach(data => {
    const exist = db.prepare('SELECT id FROM fish WHERE name = ?').get(data[0]);
    if (!exist) {
        insertFish.run(...data);
        console.log(`+ Ikan Baru: ${data[0]}`);
    }
});
db.close();
console.log('✅ 25 Ikan Baru Berhasil Di-seed!');
