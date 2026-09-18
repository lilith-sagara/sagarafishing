const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);
const ANNOUNCE_FILE = path.join(__dirname, 'announce_target.json');

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

CREATE TABLE IF NOT EXISTS asset_prices (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    price REAL NOT NULL,
    prev_price REAL DEFAULT 0,
    updated_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_assets (
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS last_seen_jid (
    user_id INTEGER PRIMARY KEY,
    jid TEXT NOT NULL
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
if (!userCols.includes('session_island')) {
    db.exec("ALTER TABLE users ADD COLUMN session_island TEXT NOT NULL DEFAULT 'utama'");
}

const SESSION_ISLANDS = [
    { key: 'utama', name: '🏝️ Pulau Utama', desc: 'Perairan Sagara. Ikan umum hingga celestial.', tiers: [1,2,3,4,5,6,7,8], reqLevel: 0, reqNetWorth: 0, reqRodTiers: [] },
    { key: 'teluk', name: '🌾 Teluk Nelayan Muda', desc: 'Tempat mancing santai untuk pemula.', tiers: [1,2], reqLevel: 0, reqNetWorth: 0, reqRodTiers: [] },
    { key: 'bakau', name: '🌳 Hutan Bakau Bayang', desc: 'Bakau teduh, penuh ikan rare.', tiers: [2,3,4], reqLevel: 25, reqNetWorth: 0, reqRodTiers: [] },
    { key: 'laguna', name: '🪸 Laguna Karang Senja', desc: 'Karang cantik, epic & legendary.', tiers: [4,5,6], reqLevel: 50, reqNetWorth: 0, reqRodTiers: [] },
    { key: 'purba', name: '🦴 Pulau Purba', desc: 'Dasar laut purba. Divine & celestial langka.', tiers: [7,8,9], reqLevel: 100, reqNetWorth: 100000000, reqRodTiers: [] },
    { key: 'kosmik', name: '🌌 Pulau Sagara Kosmik', desc: 'Samudera galaksi. Cosmic, primordial, the sky.', tiers: [9,10,11], reqLevel: 1000, reqNetWorth: 1000000000000, reqRodTiers: [] },
    { key: 'demonangel', name: '⚔️ Pulau Angel & Demon', desc: 'Khusus ikan iblis & malaikat laut.', tiers: [12], reqLevel: 10000, reqNetWorth: 15000000000000, reqRodTiers: [35,36,37] }
];

function rowToDict(row) {
    return row ? { ...row } : null;
}

// ======== TRADING SYSTEM ========
const TRADING_INTERVAL_MS = 15 * 60 * 1000;
const TRADING_CAP = 1e6;
const TRADING_ASSETS = [
    { symbol: 'BTC', name: 'Bitcoin', type: 'Kripto', base: 1000000 },
    { symbol: 'ETH', name: 'Ethereum', type: 'Kripto', base: 320000 },
    { symbol: 'SOL', name: 'Solana', type: 'Kripto', base: 150000 },
    { symbol: 'BNB', name: 'Binance Coin', type: 'Kripto', base: 520000 },
    { symbol: 'XRP', name: 'Ripple', type: 'Kripto', base: 48000 },
    { symbol: 'DOGE', name: 'Dogecoin', type: 'Kripto', base: 26000 },
    { symbol: 'ADA', name: 'Cardano', type: 'Kripto', base: 38000 },
    { symbol: 'PEPE', name: 'Pepe Coin', type: 'Kripto', base: 22000 },
    { symbol: 'USD', name: 'US Dollar', type: 'Mata Uang', base: 15000 },
    { symbol: 'EUR', name: 'Euro', type: 'Mata Uang', base: 17500 },
    { symbol: 'GBP', name: 'Poundsterling', type: 'Mata Uang', base: 20000 },
    { symbol: 'JPY', name: 'Yen Jepang', type: 'Mata Uang', base: 8000 },
    { symbol: 'AUD', name: 'Dollar Australia', type: 'Mata Uang', base: 12000 },
    { symbol: 'MYR', name: 'Ringgit Malaysia', type: 'Mata Uang', base: 5000 },
    { symbol: 'SGD', name: 'Dollar Singapura', type: 'Mata Uang', base: 9000 }
];

function ensureTradingData() {
    const count = db.prepare('SELECT COUNT(*) c FROM asset_prices').get().c;
    if (count > 0) return;
    const now = Date.now();
    const ins = db.prepare('INSERT INTO asset_prices (symbol, name, type, price, prev_price, updated_at) VALUES (?, ?, ?, ?, 0, ?)');
    const tx = db.transaction(() => {
        TRADING_ASSETS.forEach(a => ins.run(a.symbol, a.name, a.type, a.base, now));
    });
    tx();
}

function updateAssetPricesIfDue() {
    return rollTradingPrices() !== null;
}

function rollTradingPrices() {
    ensureTradingData();
    const first = db.prepare('SELECT updated_at FROM asset_prices ORDER BY rowid LIMIT 1').get();
    if (first && Date.now() - first.updated_at < TRADING_INTERVAL_MS) return null;
    const rows = db.prepare('SELECT symbol, name, type, price FROM asset_prices').all();
    const now = Date.now();
    const up = db.prepare('UPDATE asset_prices SET prev_price = ?, price = ?, updated_at = ? WHERE symbol = ?');
    const moves = [];
    const tx = db.transaction(() => {
        rows.forEach(r => {
            const change = Math.random() * 0.30 - 0.15;
            const next = Math.max(1, Math.round(r.price * (1 + change) * 100) / 100);
            const pct = Math.round((next / r.price - 1) * 1000) / 10;
            up.run(r.price, next, now, r.symbol);
            moves.push({ symbol: r.symbol, name: r.name, type: r.type, from: r.price, to: next, pct });
        });
    });
    tx();
    return moves;
}

function getAnnounceTarget() {
    try {
        const j = JSON.parse(fs.readFileSync(ANNOUNCE_FILE, 'utf8'));
        return j && j.jid ? j.jid : null;
    } catch (e) {
        return null;
    }
}

function setAnnounceTarget(jid) {
    fs.writeFileSync(ANNOUNCE_FILE, JSON.stringify({ jid, updated: Date.now() }));
}

function clearAnnounceTarget() {
    try { fs.unlinkSync(ANNOUNCE_FILE); } catch (e) { /* tidak ada file */ }
}

function getLivePrices() {
    ensureTradingData();
    updateAssetPricesIfDue();
    return db.prepare(`
        SELECT symbol, name, type, price, prev_price, updated_at
        FROM asset_prices
        ORDER BY CASE type WHEN 'Mata Uang' THEN 1 ELSE 2 END, symbol
    `).all().map(r => ({
        ...r,
        changePct: r.prev_price > 0 ? Math.round(((r.price / r.prev_price) - 1) * 1000) / 10 : 0
    }));
}

function getUserAssetsRows(userId) {
    ensureTradingData();
    updateAssetPricesIfDue();
    return db.prepare(`
        SELECT ua.symbol, ua.amount, ap.name, ap.type, ap.price, ROUND(ua.amount * ap.price, 2) AS value
        FROM user_assets ua
        JOIN asset_prices ap ON ap.symbol = ua.symbol
        WHERE ua.user_id = ? AND ua.amount > 0
        ORDER BY value DESC
    `).all(userId);
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

    getSessionIslands: () => SESSION_ISLANDS,

    getSessionIsland: (key) => SESSION_ISLANDS.find(i => i.key === key) || SESSION_ISLANDS[0],

    getSessionIslandKey: (userId) => {
        const row = db.prepare('SELECT session_island FROM users WHERE user_id = ?').get(userId);
        return (row && row.session_island) || 'utama';
    },

    setSessionIsland: (userId, key) => {
        db.prepare("UPDATE users SET session_island = ? WHERE user_id = ?").run(key, userId);
    },

    getNetWorth: (userId) => {
        const user = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(userId);
        ensureTradingData();
        updateAssetPricesIfDue();
        const assetVal = db.prepare(`
            SELECT COALESCE(SUM(ua.amount * ap.price), 0) v
            FROM user_assets ua
            JOIN asset_prices ap ON ap.symbol = ua.symbol
            WHERE ua.user_id = ?
        `).get(userId);
        return (user ? user.coins : 0) + Math.round(assetVal.v);
    },

    ownsRodTier: (userId, tiers) => {
        const owns = db.prepare('SELECT rod_tier FROM user_rods WHERE user_id = ?').all(userId);
        return owns.some(o => tiers.includes(o.rod_tier));
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

    getRandomFishBySessionIsland: (maxRodTier, island, luck) => {
        const allowed = island.tiers.filter(t => t <= maxRodTier);
        if (allowed.length === 0) return null;
        const rollCap = Math.min(maxRodTier, Math.max(...island.tiers));
        const eff = Math.floor(Math.random() * (rollCap + luck) + 1);
        const eligible = allowed.filter(t => t <= eff);
        let list;
        if (eligible.length > 0) {
            list = db.prepare(`SELECT * FROM fish WHERE tier IN (${eligible.join(',')}) ORDER BY RANDOM()`).all();
        } else {
            list = db.prepare('SELECT * FROM fish WHERE tier = ? ORDER BY RANDOM()').all(Math.min(...allowed));
        }
        return list.length > 0 ? rowToDict(list[0]) : null;
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

    sellFishByName: (userId, fishName) => {
        const name = String(fishName || '').trim();
        if (!name) return { ok: false, count: 0, total: 0 };
        const items = db.prepare(`
            SELECT i.id, i.weight, f.name, f.price_per_kg
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.user_id = ? AND i.sold = 0 AND LOWER(f.name) LIKE ?
        `).all(userId, `%${name.toLowerCase()}%`);
        if (items.length === 0) return { ok: false, count: 0, total: 0 };
        let total = 0;
        const tx = db.transaction(() => {
            items.forEach(it => {
                total += Math.floor(it.weight * it.price_per_kg);
                db.prepare('UPDATE inventory SET sold = 1 WHERE id = ?').run(it.id);
            });
            db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(total, userId);
        });
        tx();
        return { ok: true, count: items.length, total, names: [...new Set(items.map(i => i.name))] };
    },
    
    getLeaderboard: (limit = 10) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        return db.prepare(`
            SELECT u.user_id, u.username, u.coins, u.level, u.total_catches, u.rod_tier,
                COALESCE(a.asset_value, 0) AS asset_value
            FROM users u
            LEFT JOIN (
                SELECT ua.user_id, SUM(ua.amount * ap.price) AS asset_value
                FROM user_assets ua
                JOIN asset_prices ap ON ap.symbol = ua.symbol
                WHERE ua.amount > 0
                GROUP BY ua.user_id
            ) a ON a.user_id = u.user_id
            WHERE NOT (u.user_id BETWEEN 900000 AND 900011)
            ORDER BY (u.coins + COALESCE(a.asset_value, 0)) DESC
            LIMIT ?
        `).all(limit);
    },

    getUserRank: (userId) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        const row = db.prepare(`
            SELECT COUNT(*) c FROM users u
            LEFT JOIN (
                SELECT ua.user_id, SUM(ua.amount * ap.price) AS asset_value
                FROM user_assets ua
                JOIN asset_prices ap ON ap.symbol = ua.symbol
                WHERE ua.amount > 0
                GROUP BY ua.user_id
            ) a ON a.user_id = u.user_id
            WHERE NOT (u.user_id BETWEEN 900000 AND 900011)
            AND (u.coins + COALESCE(a.asset_value, 0)) > (
                SELECT tar.coins + COALESCE(b.asset_value, 0)
                FROM users tar
                LEFT JOIN (
                    SELECT ua.user_id, SUM(ua.amount * ap.price) AS asset_value
                    FROM user_assets ua
                    JOIN asset_prices ap ON ap.symbol = ua.symbol
                    WHERE ua.amount > 0
                    GROUP BY ua.user_id
                ) b ON b.user_id = tar.user_id
                WHERE tar.user_id = ?
            )
        `).get(userId);
        return (row.c || 0) + 1;
    },

    setLastSeenJid: (userId, jid) => {
        db.prepare('INSERT INTO last_seen_jid (user_id, jid) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET jid = excluded.jid').run(userId, jid);
    },

    getBroadcastUsers: () => {
        return db.prepare(`
            SELECT u.user_id, u.username, COALESCE(lj.jid, u.user_id || '@s.whatsapp.net') AS jid
            FROM users u
            LEFT JOIN last_seen_jid lj ON lj.user_id = u.user_id
            WHERE NOT (u.user_id BETWEEN 900000 AND 999999999)
        `).all();
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

    // TRADING SYSTEM: beli/jual aset (kripto & mata uang)
    getAssetPrice: (symbol) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        return db.prepare('SELECT * FROM asset_prices WHERE symbol = ?').get(String(symbol).toUpperCase());
    },

    // TRADING ANNOUNCEMENT
    rollPrices: () => rollTradingPrices(),
    getAnnounceTarget: () => getAnnounceTarget(),
    setAnnounceTarget: (jid) => setAnnounceTarget(jid),
    clearAnnounceTarget: () => clearAnnounceTarget(),

    getAssetPrices: () => getLivePrices(),

    getUserAssets: (userId) => getUserAssetsRows(userId),

    getAssetValue: (userId) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        const row = db.prepare(`
            SELECT COALESCE(SUM(ua.amount * ap.price), 0) v
            FROM user_assets ua
            JOIN asset_prices ap ON ap.symbol = ua.symbol
            WHERE ua.user_id = ?
        `).get(userId);
        return Math.round(row.v);
    },

    buyAsset: (userId, symbol, amount) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        const sym = String(symbol).toUpperCase();
        const a = db.prepare('SELECT * FROM asset_prices WHERE symbol = ?').get(sym);
        if (!a) return { ok: false, msg: 'Aset tidak ditemukan. Lihat daftar: *.trading*' };
        if (!Number.isInteger(amount) || amount < 1) return { ok: false, msg: 'Jumlah harus angka bulat 1 atau lebih. Contoh: *.trading beli BTC 5*' };
        const total = Math.round(amount * a.price);
        const user = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(userId);
        if (!user) return { ok: false, msg: 'Kamu belum terdaftar.' };
        if (user.coins < total) return { ok: false, msg: `Koin kurang! Butuh *${total.toLocaleString()} Koin* (${amount} × ${a.price.toLocaleString()}).` };
        const held = db.prepare('SELECT amount FROM user_assets WHERE user_id = ? AND symbol = ?').get(userId, sym);
        const newAmount = (held ? held.amount : 0) + amount;
        if (newAmount > TRADING_CAP) return { ok: false, msg: `Maksimal 1.000.000 unit *${sym}* per pemain.` };
        const tx = db.transaction(() => {
            db.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ?').run(total, userId);
            db.prepare('INSERT INTO user_assets (user_id, symbol, amount) VALUES (?, ?, ?) ON CONFLICT(user_id, symbol) DO UPDATE SET amount = amount + ?').run(userId, sym, amount, amount);
        });
        tx();
        return { ok: true, symbol: sym, name: a.name, amount, total, price: a.price };
    },

    sellAsset: (userId, symbol, amount) => {
        ensureTradingData();
        updateAssetPricesIfDue();
        const sym = String(symbol).toUpperCase();
        const a = db.prepare('SELECT * FROM asset_prices WHERE symbol = ?').get(sym);
        if (!a) return { ok: false, msg: 'Aset tidak ditemukan. Lihat daftar: *.trading*' };
        const held = db.prepare('SELECT amount FROM user_assets WHERE user_id = ? AND symbol = ?').get(userId, sym);
        const ownAmt = held ? held.amount : 0;
        if (ownAmt <= 0) return { ok: false, msg: `Kamu tidak punya *${sym}*.` };
        const sell = amount === Infinity ? ownAmt : Math.floor(amount);
        if (Number.isNaN(sell) || sell < 1) return { ok: false, msg: 'Jumlah harus angka bulat 1 atau lebih. Contoh: *.trading jual BTC 2* atau *.trading jual BTC semua*' };
        const qty = Math.min(sell, ownAmt);
        const total = Math.round(qty * a.price);
        const remain = ownAmt - qty;
        const tx = db.transaction(() => {
            db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(total, userId);
            if (remain <= 0) db.prepare('DELETE FROM user_assets WHERE user_id = ? AND symbol = ?').run(userId, sym);
            else db.prepare('UPDATE user_assets SET amount = ? WHERE user_id = ? AND symbol = ?').run(remain, userId, sym);
        });
        tx();
        return { ok: true, symbol: sym, name: a.name, amount: qty, total, price: a.price };
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
