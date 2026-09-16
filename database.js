const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    coins INTEGER DEFAULT 1000,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    rod_tier INTEGER DEFAULT 1,
    luck INTEGER DEFAULT 1,
    total_catches INTEGER DEFAULT 0,
    max_weight_caught REAL DEFAULT 0.0,
    last_fish_time INTEGER DEFAULT 0,
    daily_streak INTEGER DEFAULT 0,
    last_daily_time INTEGER DEFAULT 0,
    current_island_id INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_islands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    island_id INTEGER NOT NULL,
    bought_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fish_id INTEGER NOT NULL,
    weight REAL NOT NULL,
    sold BOOLEAN DEFAULT 0,
    caught_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS aquarium (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    inv_id INTEGER NOT NULL UNIQUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (inv_id) REFERENCES inventory(id)
);

CREATE TABLE IF NOT EXISTS gacha_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    result_text TEXT NOT NULL,
    is_jackpot BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gacha_pity (
    user_key TEXT PRIMARY KEY,
    pity_count INTEGER DEFAULT 0,
    pity_target INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_rods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rod_tier INTEGER NOT NULL,
    rod_name TEXT,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, rod_tier)
);

CREATE TABLE IF NOT EXISTS museum (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    inv_id INTEGER NOT NULL UNIQUE,
    price INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (inv_id) REFERENCES inventory(id)
);

CREATE TABLE IF NOT EXISTS cooldown_boosts (
    user_id INTEGER PRIMARY KEY,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fish (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tier INTEGER NOT NULL,
    tier_name TEXT NOT NULL,
    emoji TEXT NOT NULL,
    description TEXT,
    price_per_kg INTEGER NOT NULL,
    weight_min REAL NOT NULL,
    weight_max REAL NOT NULL,
    rarity INTEGER NOT NULL
);
`);

const gachaCols = db.prepare('PRAGMA table_info(gacha_pity)').all().map(c => c.name);
if (!gachaCols.includes('pity_target')) {
    db.exec('ALTER TABLE gacha_pity ADD COLUMN pity_target INTEGER DEFAULT 0');
}
const rodCols = db.prepare('PRAGMA table_info(user_rods)').all().map(c => c.name);
if (!rodCols.includes('rod_name')) {
    db.exec('ALTER TABLE user_rods ADD COLUMN rod_name TEXT DEFAULT NULL');
}
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('current_island_id')) {
    db.exec('ALTER TABLE users ADD COLUMN current_island_id INTEGER DEFAULT 0');
}

function rowToDict(row) {
    return row ? { ...row } : null;
}

const database = {
    getOrCreateUser: (userId, username) => {
        let user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
        if (!user) {
            db.prepare('INSERT INTO users (user_id, username) VALUES (?, ?)').run(userId, username);
            user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
        }
        db.prepare('INSERT OR IGNORE INTO user_rods (user_id, rod_tier) VALUES (?, 1)').run(userId);
        return rowToDict(user);
    },
    
    getUser: (userId) => {
        const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
        return rowToDict(user);
    },
    
    updateUsername: (userId, username) => {
        db.prepare('UPDATE users SET username = ? WHERE user_id = ?').run(username, userId);
    },

    getUserByUsername: (username) => {
        return rowToDict(db.prepare('SELECT * FROM users WHERE username = ?').get(username));
    },
    
    updateCoins: (userId, coins) => {
        db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(coins, userId);
    },
    
    updateExp: (userId, exp) => {
        db.prepare('UPDATE users SET exp = exp + ? WHERE user_id = ?').run(exp, userId);
    },
    
    updateLevel: (userId, level) => {
        db.prepare('UPDATE users SET level = ? WHERE user_id = ?').run(level, userId);
    },
    
    updateRodTier: (userId, rodTier) => {
        db.prepare('UPDATE users SET rod_tier = ? WHERE user_id = ?').run(rodTier, userId);
    },
    
    updateLuck: (userId, luck) => {
        db.prepare('UPDATE users SET luck = ? WHERE user_id = ?').run(luck, userId);
    },
    
    updateLastFishTime: (userId) => {
        db.prepare('UPDATE users SET last_fish_time = ? WHERE user_id = ?').run(Date.now(), userId);
    },

    // ROD SYSTEM
    addRod: (userId, rodTier, rodName = null) => {
        db.prepare('INSERT INTO user_rods (user_id, rod_tier, rod_name) VALUES (?, ?, ?) ON CONFLICT(user_id, rod_tier) DO UPDATE SET rod_name = COALESCE(user_rods.rod_name, excluded.rod_name)').run(userId, rodTier, rodName);
    },

    getUserRods: (userId) => {
        let rows = db.prepare('SELECT rod_tier, rod_name FROM user_rods WHERE user_id = ? ORDER BY rod_tier').all(userId);
        if (rows.length === 0) {
            const user = db.prepare('SELECT rod_tier FROM users WHERE user_id = ?').get(userId);
            if (user) {
                const tiers = new Set([1]);
                if (user.rod_tier && user.rod_tier !== 1) tiers.add(user.rod_tier);
                const gachaNames = { 35: '⚔️ Rafael the Angel (Rod)', 36: '🖤 Lilith the Demon (Rod)', 37: '👼 Cassy the Lady Angel (Rod)' };
                tiers.forEach(t => db.prepare('INSERT OR IGNORE INTO user_rods (user_id, rod_tier, rod_name) VALUES (?, ?, ?)').run(userId, t, gachaNames[t] || null));
                rows = db.prepare('SELECT rod_tier, rod_name FROM user_rods WHERE user_id = ? ORDER BY rod_tier').all(userId);
            }
        }
        return rows;
    },
    
    incrementCatches: (userId) => {
        db.prepare('UPDATE users SET total_catches = total_catches + 1 WHERE user_id = ?').run(userId);
    },
    
    updateMaxWeight: (userId, weight) => {
        db.prepare('UPDATE users SET max_weight_caught = ? WHERE user_id = ? AND ? > max_weight_caught').run(weight, userId, weight);
    },

    // ISLAND SYSTEM
    getIslands: () => [
        { id: 1, name: '🏝️ Pulau Tropis Perdana', price: 500000000000000, luckBonus: 50, desc: 'Pulau tropis sederhana namun asri.' },
        { id: 2, name: '🪸 Pulau Karang Delima', price: 1200000000000000, luckBonus: 100, desc: 'Surga karang langka penuh misteri.' },
        { id: 3, name: '🌋 Pulau Mutiara Vulkanik', price: 3000000000000000, luckBonus: 250, desc: 'Energi panas bumi memikat ikan purba.' },
        { id: 4, name: '👑 Pulau Atlantis Impian', price: 7000000000000000, luckBonus: 500, desc: 'Sisa peradaban laut yang legendaris.' },
        { id: 5, name: '🌌 Pulau Dimensi Sagara', price: 15000000000000000, luckBonus: 1000, desc: 'Pulau melayang di batas samudera galaksi.' }
    ],

    buyIsland: (userId, islandId) => {
        db.prepare('INSERT INTO user_islands (user_id, island_id) VALUES (?, ?)').run(userId, islandId);
    },

    getUserIslands: (userId) => {
        return db.prepare('SELECT island_id FROM user_islands WHERE user_id = ?').all(userId).map(row => row.island_id);
    },

    setIsland: (userId, islandId) => {
        db.prepare('UPDATE users SET current_island_id = ? WHERE user_id = ?').run(islandId, userId);
    },
    
    addInventory: (userId, fishId, weight) => {
        const res = db.prepare('INSERT INTO inventory (user_id, fish_id, weight) VALUES (?, ?, ?)').run(userId, fishId, weight);
        return res.lastInsertRowid;
    },
    
    getInventory: (userId, page = 1, perPage = 15, tier = null) => {
        const offset = (page - 1) * perPage;
        let query = `
            SELECT i.*, f.name, f.tier, f.tier_name, f.emoji, f.price_per_kg
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.user_id = ? AND i.sold = 0
        `;
        const params = [userId];
        
        if (tier !== null) {
            query += ' AND f.tier = ?';
            params.push(tier);
        }
        
        query += ' ORDER BY i.id DESC LIMIT ? OFFSET ?';
        params.push(perPage, offset);
        
        const items = db.prepare(query).all(...params);
        return { items };
    },
    
    getInventoryCount: (userId) => {
        const row = db.prepare('SELECT COUNT(*) c FROM inventory WHERE user_id = ? AND sold = 0').get(userId);
        return row.c;
    },

    getUserAquarium: (userId) => {
        return db.prepare(`
            SELECT a.id as aq_id, a.inv_id, i.*, f.name, f.emoji, f.tier_name
            FROM aquarium a
            JOIN inventory i ON a.inv_id = i.id
            JOIN fish f ON i.fish_id = f.id
            WHERE a.user_id = ?
        `).all(userId);
    },

    addToAquarium: (userId, invId) => {
        try {
            db.prepare('INSERT INTO aquarium (user_id, inv_id) VALUES (?, ?)').run(userId, invId);
            return true;
        } catch (e) {
            return false;
        }
    },

    removeFromAquarium: (userId, invId) => {
        db.prepare('DELETE FROM aquarium WHERE user_id = ? AND inv_id = ?').run(userId, invId);
    },

    // MUSEUM SYSTEM
    addMuseumItem: (userId, invId, price) => {
        const inv = db.prepare('SELECT id, sold FROM inventory WHERE id = ? AND user_id = ?').get(invId, userId);
        if (!inv || inv.sold) return { ok: false, msg: 'Ikan tidak ditemukan di inventory kamu.' };
        const exists = db.prepare('SELECT id FROM museum WHERE inv_id = ?').get(invId);
        if (exists) return { ok: false, msg: 'Ikan ini sudah dipajang di museum.' };
        db.prepare('UPDATE inventory SET sold = 1 WHERE id = ?').run(invId);
        db.prepare('INSERT INTO museum (user_id, inv_id, price) VALUES (?, ?, ?)').run(userId, invId, price);
        return { ok: true };
    },

    removeMuseumItem: (userId, code) => {
        const row = db.prepare('SELECT * FROM museum WHERE user_id = ? AND (id = ? OR inv_id = ?)').get(userId, code, code);
        if (!row) return { ok: false };
        db.prepare('UPDATE inventory SET sold = 0 WHERE id = ?').run(row.inv_id);
        db.prepare('DELETE FROM museum WHERE id = ?').run(row.id);
        return { ok: true };
    },

    getMuseum: (userId) => {
        return db.prepare(`
            SELECT m.id, m.inv_id, m.price, i.weight, f.name, f.emoji, f.tier, f.tier_name
            FROM museum m
            JOIN inventory i ON m.inv_id = i.id
            JOIN fish f ON i.fish_id = f.id
            WHERE m.user_id = ?
            ORDER BY m.id
        `).all(userId);
    },

    getMuseumItem: (museumId) => {
        return db.prepare(`
            SELECT m.id, m.user_id, m.price, i.weight, f.name, f.emoji, f.tier, f.tier_name
            FROM museum m
            JOIN inventory i ON m.inv_id = i.id
            JOIN fish f ON i.fish_id = f.id
            WHERE m.id = ?
        `).get(museumId);
    },

    buyMuseumItem: (buyerId, museumId) => {
        const m = db.prepare('SELECT * FROM museum WHERE id = ?').get(museumId);
        if (!m) return { ok: false, msg: 'Kode museum tidak ditemukan.' };
        if (m.user_id === buyerId) return { ok: false, msg: 'Ini museum kamu sendiri!' };
        const buyer = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(buyerId);
        if (!buyer) return { ok: false, msg: 'Kamu belum terdaftar.' };
        if (buyer.coins < m.price) return { ok: false, msg: `Koin kamu kurang! Butuh *${m.price.toLocaleString()}*.` };
        const ownerName = db.prepare('SELECT username FROM users WHERE user_id = ?').get(m.user_id);
        const fish = db.prepare(`
            SELECT m.id, m.user_id, m.price, i.weight, f.name, f.emoji, f.tier, f.tier_name
            FROM museum m
            JOIN inventory i ON m.inv_id = i.id
            JOIN fish f ON i.fish_id = f.id
            WHERE m.id = ?
        `).get(museumId);
        const tx = db.transaction(() => {
            db.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ?').run(m.price, buyerId);
            db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(m.price, m.user_id);
            db.prepare('UPDATE inventory SET user_id = ?, sold = 0 WHERE id = ?').run(buyerId, m.inv_id);
            db.prepare('DELETE FROM museum WHERE id = ?').run(museumId);
        });
        tx();
        return { ok: true, price: m.price, fish, ownerName: ownerName && ownerName.username };
    },
    
    getFishById: (fishId) => {
        return rowToDict(db.prepare('SELECT * FROM fish WHERE id = ?').get(fishId));
    },
    
    getRandomFishByTier: (maxTier, luck) => {
        const effectiveMaxTier = Math.min(maxTier, Math.floor(Math.random() * (maxTier + luck) + 1));
        const fishList = db.prepare('SELECT * FROM fish WHERE tier <= ? ORDER BY RANDOM()').all(effectiveMaxTier);
        return fishList.length > 0 ? rowToDict(fishList[Math.floor(Math.random() * fishList.length)]) : null;
    },
    
    sellFish: (userId, invId) => {
        const inv = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ? AND sold = 0').get(invId, userId);
        if (!inv) return null;
        
        const fish = db.prepare('SELECT * FROM fish WHERE id = ?').get(inv.fish_id);
        const price = Math.floor(inv.weight * fish.price_per_kg);
        
        db.prepare('UPDATE inventory SET sold = 1 WHERE id = ?').run(invId);
        db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(price, userId);
        
        return { fishName: fish.name, price };
    },
    
    getLeaderboard: (limit = 10) => {
        return db.prepare(`
            SELECT username, coins, level, total_catches, rod_tier
            FROM users
            WHERE NOT (user_id BETWEEN 900000 AND 900011)
            ORDER BY coins DESC
            LIMIT ?
        `).all(limit);
    },

    getUserRank: (userId) => {
        const row = db.prepare('SELECT COUNT(*) c FROM users WHERE coins > (SELECT coins FROM users WHERE user_id = ?) AND NOT (user_id BETWEEN 900000 AND 900011)').get(userId);
        return (row.c || 0) + 1;
    },

    getPity: (userKey) => {
        const row = db.prepare('SELECT pity_count FROM gacha_pity WHERE user_key = ?').get(String(userKey));
        return row ? row.pity_count : 0;
    },

    getPityTarget: (userKey, minPity = 200, maxPity = 300) => {
        const row = db.prepare('SELECT pity_target FROM gacha_pity WHERE user_key = ?').get(String(userKey));
        if (row && row.pity_target >= minPity && row.pity_target <= maxPity) return row.pity_target;
        const target = Math.floor(Math.random() * (maxPity - minPity + 1)) + minPity;
        db.prepare('INSERT INTO gacha_pity (user_key, pity_count, pity_target) VALUES (?, 0, ?) ON CONFLICT(user_key) DO UPDATE SET pity_target = excluded.pity_target').run(String(userKey), target);
        return target;
    },

    setPity: (userKey, count) => {
        db.prepare('UPDATE gacha_pity SET pity_count = ? WHERE user_key = ?').run(count, String(userKey));
    },

    resetPity: (userKey) => {
        db.prepare('DELETE FROM gacha_pity WHERE user_key = ?').run(String(userKey));
    },

    // COOLDOWN ACTIVATOR: buat cooldown mancing jadi 1 detik
    activateCooldownBoost: (userId, minutes = 30) => {
        const now = Date.now();
        const row = db.prepare('SELECT expires_at FROM cooldown_boosts WHERE user_id = ?').get(userId);
        const base = Math.max(now, row ? row.expires_at : 0);
        const expires = base + minutes * 60000;
        db.prepare('INSERT INTO cooldown_boosts (user_id, expires_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at').run(userId, expires);
        return expires;
    },

    getCooldownBoostMs: (userId) => {
        const row = db.prepare('SELECT expires_at FROM cooldown_boosts WHERE user_id = ?').get(userId);
        if (!row) return 0;
        const rem = row.expires_at - Date.now();
        if (rem <= 0) {
            db.prepare('DELETE FROM cooldown_boosts WHERE user_id = ?').run(userId);
            return 0;
        }
        return rem;
    },

    // TAX SYSTEM: Koin >= 900 Juta dipotong 500 Juta tiap 5 menit
    applyTax: (taxAmount = 500000000, minCoins = 900000000) => {
        const richUsers = db.prepare('SELECT user_id, username, coins FROM users WHERE coins >= ?').all(minCoins);
        richUsers.forEach(user => {
            const newCoins = Math.max(0, user.coins - taxAmount);
            db.prepare('UPDATE users SET coins = ? WHERE user_id = ?').run(newCoins, user.user_id);
            console.log(`💸 [TAX SYSTEM] User ${user.username} (${user.coins.toLocaleString()} Koin) terkena pajak otomatis -500 Juta Koin! Sisa: ${newCoins.toLocaleString()}`);
        });
        return richUsers.length;
    }
};

module.exports = database;
