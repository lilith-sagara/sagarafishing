const fs = require('fs');

let content = fs.readFileSync('/home/lilith/sagarafishing/keyboards.js', 'utf8');

const updatedRodsCode = `const { Markup } = require('telegraf');

const RODS = [
    // TIER 1 - 5: NOVICE (Cooldown: 5.0 - 4.2s)
    { tier: 1, name: '🎣 Novice\\'s Branch', price: 0, max_tier: 1, cooldown: 5.0, luck_bonus: 0, description: 'Ranting kayu seadanya.', tier_label: 'NOVICE' },
    { tier: 2, name: '🪝 Old Man\\'s Hook', price: 500, max_tier: 1, cooldown: 4.8, luck_bonus: 1, description: 'Kail tua pemberian kakek.', tier_label: 'NOVICE' },
    { tier: 3, name: '🪨 River Pebble Rod', price: 1200, max_tier: 1, cooldown: 4.5, luck_bonus: 2, description: 'Pancingan berat dari batu kali.', tier_label: 'NOVICE' },
    { tier: 4, name: '🎋 Bamboo Whacker', price: 2500, max_tier: 1, cooldown: 4.3, luck_bonus: 3, description: 'Bambu pilihan yang fleksibel.', tier_label: 'NOVICE' },
    { tier: 5, name: '🧪 Plastic Reel Special', price: 5000, max_tier: 1, cooldown: 4.0, luck_bonus: 5, description: 'Pancingan pabrikan massal.', tier_label: 'NOVICE' },

    // TIER 6 - 10: ADEPT (Cooldown: 3.8 - 3.0s)
    { tier: 6, name: '🌊 Tide Runner', price: 10000, max_tier: 2, cooldown: 3.8, luck_bonus: 7, description: 'Ringan, cocok buat kejar ombak.', tier_label: 'ADEPT' },
    { tier: 7, name: '⚙️ Iron-Grip Pole', price: 18000, max_tier: 2, cooldown: 3.5, luck_bonus: 10, description: 'Grip besi, anti slip.', tier_label: 'ADEPT' },
    { tier: 8, name: '🌳 Mangrove Striker', price: 30000, max_tier: 2, cooldown: 3.3, luck_bonus: 15, description: 'Kayu mangrove tahan air asin.', tier_label: 'ADEPT' },
    { tier: 9, name: '🪸 Reef Seeker', price: 50000, max_tier: 2, cooldown: 3.1, luck_bonus: 20, description: 'Khusus mencari ikan di sela karang.', tier_label: 'ADEPT' },
    { tier: 10, name: '🧵 Carbon-Fiber Flex', price: 85000, max_tier: 2, cooldown: 3.0, luck_bonus: 25, description: 'Sangat lentur dan kuat.', tier_label: 'ADEPT' },

    // TIER 11 - 15: MASTER (Cooldown: 2.9 - 2.8s)
    { tier: 11, name: '🛶 Wave Conqueror', price: 150000, max_tier: 3, cooldown: 2.9, luck_bonus: 35, description: 'Penakluk gelombang tinggi.', tier_label: 'MASTER' },
    { tier: 12, name: '⚡ Storm Breaker', price: 250000, max_tier: 3, cooldown: 2.85, luck_bonus: 45, description: 'Tetap kokoh saat badai menerjang.', tier_label: 'MASTER' },
    { tier: 13, name: '🦈 Deep Sea Predator', price: 450000, max_tier: 3, cooldown: 2.82, luck_bonus: 60, description: 'Memancing predator laut dalam.', tier_label: 'MASTER' },
    { tier: 14, name: '🦾 Titanium Anchor Rod', price: 750000, max_tier: 3, cooldown: 2.8, luck_bonus: 80, description: 'Pancingan sekuat jangkar kapal.', tier_label: 'MASTER' },
    { tier: 15, name: '🐳 Whale Hunter Custom', price: 1200000, max_tier: 3, cooldown: 2.8, luck_bonus: 100, description: 'Dibuat untuk target monster paus.', tier_label: 'MASTER' },

    // TIER 16 - 20: GRANDMASTER (Cooldown: 2.0s)
    { tier: 16, name: '🌑 Abyssal Whisper', price: 2500000, max_tier: 4, cooldown: 2.0, luck_bonus: 150, description: 'Menarik ikan dari palung terdalam.', tier_label: 'GRANDMASTER' },
    { tier: 17, name: '🐉 Leviathan Snagger', price: 4500000, max_tier: 4, cooldown: 2.0, luck_bonus: 200, description: 'Mampu menarik naga laut.', tier_label: 'GRANDMASTER' },
    { tier: 18, name: '🐙 Kraken\\'s Nightmare', price: 8000000, max_tier: 4, cooldown: 2.0, luck_bonus: 300, description: 'Ditakuti oleh gurita raksasa.', tier_label: 'GRANDMASTER' },
    { tier: 19, name: '🏚️ Ghost Ship Timber', price: 15000000, max_tier: 4, cooldown: 2.0, luck_bonus: 450, description: 'Bahan kayu kapal hantu terkutuk.', tier_label: 'GRANDMASTER' },
    { tier: 20, name: '✨ Ancient Coral Rod', price: 30000000, max_tier: 4, cooldown: 2.0, luck_bonus: 600, description: 'Karang kuno yang penuh energi.', tier_label: 'GRANDMASTER' },

    // TIER 21 - 26: TRANSCENDENCE (Cooldown: 1.5s - 1.0s)
    { tier: 21, name: '🔱 Poseidon’s Vengeance', price: 75000000, max_tier: 7, cooldown: 1.5, luck_bonus: 1000, description: 'Balas dendam sang Dewa Laut.', tier_label: 'TRANSCENDENCE' },
    { tier: 22, name: '👑 Neptune’s Royal Scepter', price: 150000000, max_tier: 7, cooldown: 1.4, luck_bonus: 1500, description: 'Tongkat kekuasaan raja samudera.', tier_label: 'TRANSCENDENCE' },
    { tier: 23, name: '🌙 Celestial Moon-Thread', price: 300000000, max_tier: 7, cooldown: 1.3, luck_bonus: 2500, description: 'Senar dari benang cahaya bulan.', tier_label: 'TRANSCENDENCE' },
    { tier: 24, name: '🦴 Tide-God’s Spine', price: 600000000, max_tier: 7, cooldown: 1.2, luck_bonus: 4000, description: 'Terbuat dari tulang belakang Dewa Pasang.', tier_label: 'TRANSCENDENCE' },
    { tier: 25, name: '🌌 Galactic Star-Line', price: 1000000000, max_tier: 7, cooldown: 1.1, luck_bonus: 7500, description: 'Memancing menembus dimensi bintang.', tier_label: 'TRANSCENDENCE' },
    { tier: 26, name: '💎 Final Sagara’s Blessing', price: 2500000000, max_tier: 7, cooldown: 1.0, luck_bonus: 15000, description: 'Berkat tertinggi dari Sagara.', tier_label: 'TRANSCENDENCE' },

    // TIER 36: LEGENDARY UNIQUE (Purchasable in Shop)
    { tier: 36, name: '🖤 Lilith Malaikat Jatuh', price: 500000000000000, max_tier: 11, cooldown: 0.3, luck_bonus: 50000, description: 'Pancingan legendaris berbalut kekuatan sang Malaikat Jatuh.', tier_label: 'FALLEN ANGEL' },

    // TIER 35: THE SKY (GACHA ONLY) (Cooldown: 0.5s)
    { tier: 35, name: '⛅ Sky-Piercer Needle', price: 0, max_tier: 11, cooldown: 0.5, luck_bonus: 35000, description: 'Jarum yang menembus lapisan langit tertinggi.', tier_label: 'THE SKY' },
    { tier: 36, name: '☁️ Cloud-Weaver Pole', price: 0, max_tier: 11, cooldown: 0.5, luck_bonus: 35000, description: 'Pancingan yang ditenun dari awan abadi.', tier_label: 'THE SKY' },
    { tier: 37, name: '🔱 Spittle Diaboli (Ludah Setan)', price: 0, max_tier: 11, cooldown: 0.5, luck_bonus: 35000, description: 'Pancingan terkutuk dari air liur iblis langit.', tier_label: 'THE SKY' }
];
`;

const endRod = content.indexOf('function getMainMenuKeyboard');
if (endRod !== -1) {
    const updated = updatedRodsCode + '\n' + content.slice(endRod);
    fs.writeFileSync('/home/lilith/sagarafishing/keyboards.js', updated);
    console.log('✅ Added Lilith Malaikat Jatuh rod successfully!');
} else {
    console.log('❌ Failed to update keyboards.js');
}
