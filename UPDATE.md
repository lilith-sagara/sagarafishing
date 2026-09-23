# UPDATE.md — Sagara Fishing Bot

Dokumen ini menjelaskan apa itu script ini, bagaimana struktur koderya, riwayat update,
dan bagaimana AI / developer berikutnya melanjutkan project ini dengan aman.

---

## 1. Apa ini?

**Sagara Fishing** adalah bot WhatsApp bergame roleplay mancing (RNG fishing game) berbasis
**Node.js + ourin-baileys** (WhatsApp Web API). Bot terhubung sebagai *linked device*
(nomor bot: `6285716348564`), membaca perintah dengan prefiks **`.`** (mis. `.mancing`, `.toko`),
dan dijalankan dengan **pm2**.

Fitur inti:
- Mancing (RNG) dengan cooldown & activator, gacha rod langka, toko rod, inventory, aquarium, museum.
- Sistem sesi **pulau**: `.pindahpulau` menentukan pool ikan (tier mana yang bisa ditangkap).
- **Trading aset** (20 aset: 8 kripto, 11 mata uang & komoditas sawit), harga di-roll ±1–100% tiap 15 menit.
- Aduman anunciado pasar & `.announce` broadcast DM owner.
- Phantom Anglers (bot NPC yang juga main).
- **Live monitor dashboard** (HTTP `localhost:3001`): aktivitas realtime via SSE + statistik
  jumlah user/tangkapan + ticker harga 20 aset. Otomatis nyala saat bot jalan.
- **Ngawi AI**: chat AI (scrape `unlimitedai` dari backup owner) dengan persona *Ngawi AI*.
  Aktif **hanya di grup** → tag nomor bot lalu tanya. Jawaban model `chat-model-reasoning` (streaming).

> Catatan: `package.json` masih berdeskripsi "Telegram", karena awalnya penulis memport dari
> bot Telegram (paket `telegraf` ada di dependencies tapi **tidak dipakai**). Runtime aktual
> adalah WhatsApp (ourin-baileys). Jangan menambah fitur Telegram.

---

## 2. Struktur kode

| File | Peran |
|---|---|
| `bot.js` | Entry point. Koneksi WhatsApp, handler `messages.upsert`, semua command, broadcast, announcement market. (~616 baris) |
| `database.js` | Seluruh logic data: skema SQLite (`better-sqlite3`), method CRUD, konfigurasi pulau sesi, trading, leaderboard. (~754 baris) |
| `keyboards.js` | `RODS` (34 definisi rod tier 1–26 & 35–37) + `getMainMenuKeyboard` (tidak dipakai fungsional). |
| `fish_data.json` | Data mentah ikan (diseed ke tabel `fish`). |
| `rods.json` | Data mentah rod (diseed ke `keyboards.js`). |
| `phantom_anglers.js` | NPC bot. |
| `session_wa/` | Sesi WhatsApp (auth). **JANGAN di-commit / jangan 2 proses bersamaan.** |
| `database.sqlite` | DB SQLite (gitignored). |
| `monitor.js` | Live dashboard (HTTP+SSE, port 3001). Dipanggil `require` di bot.js; `push(action, user, detail, extra)` merekam event, endpoint `/` (HTML), `/api/recent`, `/api/stats`, `/api/prices`, `/events` (SSE). Butuh `DB.getUserCount`, `DB.getTotalCatches`, `DB.getAssetPrices` di database.js. |
| `ai_chat.js` | Ngawi AI (CommonJS, adaptasi scrape `unlimitedai.js` dari backup owner). `NgawiAI(question)` → streaming POST ke `app.unlimitedai.chat/api/chat`, persona `CHARACTERS['ngawi-ai']`. Tanpa API key. Dipakai bot.js `handleNgawiAi`. |
| `announce_target.json` | Target grup untuk announcement market (gitignored). |
| `*.js` lain (`.seed_*`, `add_rod_lilith.js`, `update_rods.js`, `nerf_script.js`, `fix_fish_prices.js`) | Skrip sekali-jalan untuk seeding/balancing. |

### Alur utama (bot.js)
```
startWhatsApp()
  └─ connectToWhatsApp()  // makeWASocket, auth dari session_wa
       ├─ activeSock = sock  (dipakai broadcast)
       ├─ ev 'creds.update' → saveCreds
       ├─ ev 'chats.set'/'chats.upsert' → rememberChatJids → db.setLastSeenJid (backfill LID)
       ├─ ev 'connection.update' → QR print / reconnect / loggedOut
       └─ ev 'messages.upsert' → inti game:
            - skip fromMe / tanpa message
- db.setLastSeenJid(userId, jid)  // penting utk broadcast ke jid real (LID)
             - handleNgawiAi(sock, m, from, userId)  // AI: grup + tag bot + non-command → jawab, return true
             - parse text → cmd & param
            - .setann & .announce (owner) DI ATAS guard registrasi
            - guard: user harus .daftar dulu (kecuali .daftar/.setann/.announce)
            - dispatch cmd → metode db → sock.sendMessage
```

### Tabel database (database.sqlite)
`users`, `user_islands`, `user_rods`, `inventory`, `aquarium`, `gacha_logs`, `gacha_pity`,
`cooldown_boosts`, `fish`, `museum`, `user_assets`, `asset_prices`, `last_seen_jid`.

---

## 3. Sistem penting & konvensi kode

- **`db` adalah object literal of methods** (`db.exec` internal). Jangan pakai arrow function
  yang menyandarkan `this` — panggil helper module-level, atau langsung `db.prepare(...)`.
- **Pitfall `this`**: method seperti `getRandomFishBySessionIsland` tidak bisa memanggil
  `this.getRandomFishByTier`; tulis query langsung.
- **Pool ikan per pulau** didefinisikan di `SESSION_ISLANDS` dalam `database.js`:
  `{ key, name, desc, tiers[], reqLevel, reqNetWorth, reqRodTiers[] }`.
  Pemancingan memakai `getRandomFishBySessionIsland(maxRodTier, island, luck)`:
  ikan yang boleh keluar = irisan `island.tiers` ∩ tier ≤ rod aktif, dipengaruhi `luck` (dari pulau beli).
- **Luck**: `user.luck` hanya berasal dari pulau beli (`.belipulau`, 50–1000). `luck_bonus` pada rod
  TIDAK dipakai di mancing (hanya statistik display). Rod menentukan batas tier ikan.
- **LID (WhatsApp migration)**: pesan masuk kini bisa ber-`@lid`, bukan `@s.whatsapp.net`.
  **DM hanya sampai jika dikirim ke jid LID.** Maka selalu simpan jid terakhir user
  (`setLastSeenJid`) dan kirim broadcast ke jid simpanan itu, bukan `user_id@s.whatsapp.net`.
- **Broadcast**: `broadcastAnnouncement` jeda 2–3 detik, flag `broadcasting`, eksklusi phantom
  `NOT (user_id BETWEEN 900000 AND 999999999)`.
- **Trading**: `TRADING_ASSETS` (20 aset: 8 kripto, 11 mata uang: USD/EUR/GBP/JPY/AUD/MYR/SGD/TWD/CNY/KRW/INR,
  + SWI sawit). `rollTradingPrices()` tiap 15 menit menggerakkan harga **±1–100%** TAPI dengan
  **mean reversion** (tarik balik ke harga dasar `base`, `PRICE_REVERT=0.25` × gap maks ±0.8) dan
  clamp `±90%` per roll. Harga dibatasi di rentang **[10% × base, 300% × base]** (`PRICE_FLOOR_RATIO`,
  `PRICE_CAP_RATIO`) sehingga tidak pernah merosot jadi 1–9. History: versi lama random-walk murni
  tanpa reversion → semua harga nyangkut di lantai 1 (di-reset sekali via script saat update).
  `ensureTradingData()` memakai `INSERT OR IGNORE` agar aset baru otomatis masuk meski DB sudah berisi. Tampilan `.trading` mengelompokkan `['Komoditas','Mata Uang','Kripto']`
  — **jika menambah type/aset baru, pastikan tipenya masuk ke array `groups` di bot.js** (bug: SWI pernah
  tak tampil karena type 'Komoditas' tidak ada di groups). Order harga: Komoditas → Mata Uang → Kripto.
- **Misi (`.misi` / `.claim`)**: statis config `MISSIONS` di `database.js` (`{ key, name, desc,
  reqGiantFish, reqCoins, reqLevel, reward }`). `claimMission(userId, key)` cek syarat (level, jumlah
  ikan Giant via `fish.is_giant`, uang `coins`) → kalau kurang muncul daftar syarat yang tak terpenuhi;
  kalau cukup otomatis potong koin & beri rod (dan pasang `rod_tier`). Misinya sekarang 1:
  *Penguasa Langit & Bumi* (3 ikan Giant + 50 Kuadriliun + Level 50000) → hadiah **Rod Langit & Bumi
  (tier 40, luck 8000)**. Rod tier 40 (`price: 0`) ada di `RODS` keyboards.js → **TIDAK muncul di
  `.toko`** (filter `price > 0`) maupun gacha. Tier 38–39 sengaja dikosongkan (owner mau bikin sendiri).
  Pulau demonangel `reqRodTiers` sekarang `[35,36,37,40]` agar tier 40 bisa masuk.
- **fmtKoin (display uang)**: dipakai di SEMUA pesan yang menampilkan nominal koin (top menu, `.profile`,
  `.rank`, `.toko`, `.belilevel`, `.belipulau`, `.museum`, `.trading` (Tunai/Aset & transaksi), `.activator`,
  `.jual`, `.jualjenisikan`, `.pindahpulau`, pesan error DB). Aturan: Triliun/Milyar/Juta/Ribu jika
  `n >= 0.999×unit` (agar `999999→1 Juta`, bukan `1000 Ribu`), di bawah itu angka bulat. Ada salinan
  `fmtKoin` di `bot.js` & `database.js` — **jika diubah, ubah keduanya**.
- **Monitor dashboard**: `monitor.js` menjalankan HTTP+SSE di `MONITOR_PORT` (default 3001),
  listen 0.0.0.0 (akses dari HP/tabel lewat `http://<ip-lan>:3001`). Dipanggil dari `bot.js`
  (satu proses, satu koneksi DB — jangan jalan terpisah, nanti SQLite terkunci). Hook event:
  `logAct('mancing'|'jual'|'trading'|'daftar'|'claim'|'pindahpulau'|'gacha', user, detail)`.
  Nonaktifkan dengan env `MONITOR_DISABLED`.
- **Ngawi AI**: `ai_chat.js` memakai `fetch` (Node≥22) ke `app.unlimitedai.chat/api/chat`
  (scrape tanpa key, streaming parse `{type:'delta'}`). Deteksi trigger di `handleNgawiAi` (bot.js):
  harus grup (`@g.us`), ada `mentionedJid` yang cocok dengan jid bot (`BOT_NUMBER=6285716348564`
  atau `sock.user.id`), dan bukan command (`.`) — teks mention `@…` dibuang sebelum dikirim ke AI.
  Cooldown per user 8 detik (`AI_COOLDOWN_MS`). Jawaban dipotong 4096 & `**`→`*`. Bot menjawab
  dengan identitas *Ngawi AI* (persona di `ai_chat.js`).
- **Migrations**: pola `PRAGMA table_info` + `ALTER TABLE` (lihat kolom `session_island`, `rod_name`, `current_island_id`).

---

## 4. Riwayat update (git log)

```
7e2dada fitur: Ngawi AI — tag bot di grup + tanya, AI jawab (scrape unlimitedai), persona Ngawi AI
6a2e1e9 fix: trading harga tak lagi merosot ke 1-9 — mean reversion ke base + rentang [10%-300%] dari base, reset harga
7c7f2c9 fitur: monitor dashboard live (HTTP+SSE :3001) — aktivitas realtime, statistik, harga aset
0707c2a fitur: .misi & .claim misi1 — Penguasa Langit & Bumi (rod tier 40 luck 8000%, potong 50 Kuadriliun)
8487731 fitur: nerf harga Angel&Demon ke 1-2jt, +18 ikan demon (3 Giant langka 1T rate 1.67e-12, teks spesial)
9264ccc fitur: nominal koin dibaca Ribu/Juta/Milyar/Triliun di semua fitur (fmtKoin)
9347d40 fitur: 4 mata uang baru (TWD, CNY, KRW, INR) + .trading tampilkan KOMODITAS (SWI) di atas
0a39948 fitur: aset sawit SWI (Komoditas) + pergerakan harga 1-100% tiap 15 mnt
e0649f6 docs: UPDATE.md — panduan struktur kode, riwayat update, dan kontinuitas AI
27d2183 fitur: tambah 3 pulau level bawah (teluk, bakau, laguna)
5231a57 fitur: sesi pulau (.pindahpulau) 4 pulau, pool ikan per pulau, gate pulau angel & demon
c71650c balance: luck rod puluhan ribu diturunkan, cap 4500-5000
884c3c6 fix: broadcast DM pakai jid real (LID), backfill chatstore, debug koneksi
2463033 fix: .announce owner check sebelum guard registrasi + debug lid, izinkan username lilith
1859237 fitur: .announce broadcast DM ke semua user (khusus owner, jeda 2-3dtk)
d463aa7 fitur: .jualjenisikan <nama> jual semua ikan sejenis
b1d2971 fitur: announcement naik/turun harga tiap 15 mnt ke grup via .setann
e40204f fix: kuantitas kosong di .trading beli/jual default 1
2823b75 perbaikan: .profile tampilkan detail aset yang dimiliki
6103451 perbaikan: .trading tampilkan detail portofolio (nama aset, jumlah, nilai)
2623b31 fitur: trading aset (15 kripto & mata uang), harga update tiap 15 mnt, leaderboard+profile + aset
46849a8 fix: .menu tak terlihat di WA biasa (buang externalAdReply thumbnail)
7b88f3b fix: .inventory2+ tidak bisa (pagination multi-halaman)
ae2513d init
```

**Pulau sesi saat ini (7):**
`utama` (T1–8, bebas) · `teluk` (T1–2) · `bakau` (T2–4, Lv25) · `laguna` (T4–6, Lv50) ·
`purba` (T7–9, Lv100 + 100Jt) · `kosmik` (T9–11, Lv1000 + 1T) · `demonangel` (T12; Lv10000 + harta 15T + rod 35–37).

Fish tier: 1 Common · 2 Uncommon · 3 Rare · 4 Epic · 5 Legendary · 6 Mythic · 7 Divine ·
8 Celestial · 9 Cosmic · 10 Primordial · 11 The Sky · 12 Angel & Demon.

**Pulau Angel & Demon (tier 12) — nerf & Giant:**
- 27 ikan tier 12: 24 normal (harga jual ±1–2 Juta, `price_per_kg = 300`) + **3 Giant**
  (`Giant Behemoth Kraken`, `Giant Seraph Dragonfish`, `Giant Nyx Shadow Whale`, `is_giant = 1`).
- Giant: bobot 4000–5000kg × `price_per_kg 250.000.000` → jual **1–1.25 Triliun/ekor**.
- **Rate Giant 0.00000000167%** (`1.67e-12`) per tebar — TIDAK dipengaruhi rod/luck. Di demonangel,
  pool normal SELALU mengeksklusi `is_giant = 0` dan override giant dicek setelah pilih ikan normal
  (`Math.random() < 1.67e-12` → pemilihan dari `WHERE is_giant = 1 ORDER BY RANDOM()`).
- Teks tangkapan Giant berbeda (blok `[ PERISTIWA LANGKA TERDETEKSI ]`) — cabang `fish.is_giant`
  di handler `.mancing` bot.js.
- Seed idempoten: `seed_demon_giants.js` (nerf `UPDATE ... WHERE tier=12 AND is_giant=0` + insert
  dengan `INSERT` by name; jalankan sebelum/ulang kapan saja). Kolom `fish.is_giant` dimigrasi di
  `database.js` (pola `PRAGMA table_info`).

---

## 5. Cara AI berikutnya melanjutkan

### Aturan keras
1. **Jalankan SATU proses bot saja.** App aktif saat ini bernama `mancing`
   (`pm2 start bot.js --name mancing`). Jangan hidupkan instance kedua (2 socket=sesi yang
   sama → WS "conflict" → DM kacau, Bad MAC). Cek selalu dengan `ps aux | grep bot\\.js`.
   *Catatan:* nama app pm2 pernah beda-beda antar mesin (`sagara-fishing`, `bot`, `mancing`);
   yang valid = proses yang sedang jalan (`pm2 list`). Setelah `pm2 restart`, jalankan
   `pm2 save` agar daftar tersimpan.
2. **Jangan pernah commit/menghapus `session_wa/`** tanpa perintah eksplisit. Jika sesi error
   (`Connection Failure`/`Bad MAC`/`401`), opsi aman: `pm2 delete mancing`, `rm -rf session_wa`,
   `pm2 start bot.js --name mancing`, scan QR dari log (`pm2 logs mancing`), lalu kabari owner.
3. **Owner bot**: username `lilith` (user_id `47730491674663`, jid `47730491674663@lid`).
   Nomor alternatif `6287840275933`. Command admin: `.announce`, `.fetchdm` (debug).
4. **Jangan reply lewat PN jid** (`user_id@s.whatsapp.net`) untuk target LID — pakai jid
   dari `last_seen_jid` (atau `m.key.participant || from` saat pesan masuk).
5. **Verifikasi sebelum restart**: `node --check bot.js && node --check database.js`.
6. **Alur merilis perubahan**:
   ```
   node --check <file>
   pm2 restart mancing --update-env   # (bukan "bot"; cek "pm2 list" dulu)
   sleep 15; pm2 logs mancing --lines 6 --nostream | grep -E "terhubung|Running"
   # uji fungsi di grup/DM (lihat log [MSG-IN]/[EVENT-UPSERT])
   rsync -a --exclude node_modules --exclude session_wa --exclude '*.db' --exclude '*.sqlite*' \
     --exclude '*.pyc' --exclude '__pycache__' --exclude venv --exclude '.env' \
     --exclude '*.log' --exclude 'announce_target.json' \
     /home/lilith/sagarafishing/ /home/lilith/sagarafishing-clean/
   cd /home/lilith/sagarafishing-clean && git add <file> && git commit -m "..." && git push origin main
   ```
7. **Kopilot remote**: repo GitHub `lilith-sagara/sagarafishing` (PUBLIC, branch `main`)
   dijalankan dari *kopian bersih* `/home/lilith/sagarafishing-clean/` (bukan folder kerja).
8. **Balancing template**: banyak angka sensitif (harga, luck, syarat pulau, tier) berada di
   konstanta file — ubah satu tempat, jangan hardcode ganda.

### Cara menambah fitur
1. Cari method DB yang paling mirip di `database.js` → tambah method baru di sana.
2. Tambahkan command baru di `bot.js` pada blok dispatch (hindari bentrok nama `cmd`).
   Jika perlu akses "khusus", taruh pengecekan sebelum guard registrasi seperti `.announce`.
3. Uji via `node -e` (better-sqlite3 readonly) untuk cek data/pool, lalu jalankan lewat grup/DM.
4. Selalu perbarui menu (`getMenuText`) bila menambah command pengguna.
5. Update file ini (`UPDATE.md`) + commit agar kontinuitas AI berikutnya terjaga.

### Saran bukan for developer (by owner/order)
- Perbaiki variabel env: pakai `.env` untuk `TELEGRAM_TOKEN` dll — sudah ada `dotenv` di bot.js.
- Rapikan `package.json` (deskripsi WhatsApp, hapus `telegraf` bila tidak dipakai).
- Hapus script sekali-jalan yang sudah tidak dibutuhkan bila owner minta.
```

---

*Terakhir diperbarui: 20 Sep 2026 — sesi pulau 7 pulau, trading 20 aset, broadcast LID-aware, monitor dashboard live, Ngawi AI (tag bot).*