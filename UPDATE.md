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
- **Trading aset** (15 kripto & mata uang), harga di-roll ±15% tiap 15 menit.
- Adumans price baru & `.announce` broadcast DM owner.
- Phantom Anglers (bot NPC yang juga main).

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
- **Migrations**: pola `PRAGMA table_info` + `ALTER TABLE` (lihat kolom `session_island`, `rod_name`, `current_island_id`).

---

## 4. Riwayat update (git log)

```
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

---

## 5. Cara AI berikutnya melanjutkan

### Aturan keras
1. **Jalankan SATU proses bot saja.** Nama pm2: `sagara-fishing`.
   `pm2 start bot.js --name sagara-fishing --cron-restart "0 */6 * * *"`. Jangan hidupkan
   instance kedua (2 socket=sesi yang sama → WS "conflict" → DM kacau, Bad MAC).
2. **Jangan pernah commit/menghapus `session_wa/`** tanpa perintah eksplisit. Jika sesi error
   (`Connection Failure`/`Bad MAC`/`401`), opsi aman: `pm2 delete`, `rm -rf session_wa`,
   run, scan QR dari log (`pm2 logs sagara-fishing`), lalu kabari owner.
3. **Owner bot**: username `lilith` (user_id `47730491674663`, jid `47730491674663@lid`).
   Nomor alternatif `6287840275933`. Command admin: `.announce`, `.fetchdm` (debug).
4. **Jangan reply lewat PN jid** (`user_id@s.whatsapp.net`) untuk target LID — pakai jid
   dari `last_seen_jid` (atau `m.key.participant || from` saat pesan masuk).
5. **Verifikasi sebelum restart**: `node --check bot.js && node --check database.js`.
6. **Alur merilis perubahan**:
   ```
   node --check <file>
   pm2 restart sagara-fishing --update-env
   sleep 14; pm2 logs sagara-fishing --lines 5 --nostream | grep -E "terhubung|Running"
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

*Terakhir diperbarui: 19 Sep 2026 — sesi pulau 7 pulau, trading 15 aset, broadcast LID-aware.*