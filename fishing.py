#!/usr/bin/env python3
"""
Logika Mancing & RNG untuk Fishing Bot
Implementasi RNG Dua Layer: Layer 1 (Tier/Jenis Ikan) & Layer 2 (Berat Ikan)
"""

import random
import json
import os
import math
from datetime import datetime, timezone
from database import db

# Load data pendukung
BASE_DIR = os.path.dirname(__file__)
with open(os.path.join(BASE_DIR, "rods.json"), 'r', encoding='utf-8') as f:
    RODS = json.load(f)

# Load fish data cache for RNG
with open(os.path.join(BASE_DIR, "fish_data.json"), 'r', encoding='utf-8') as f:
    FISH_DATA = json.load(f)

def get_rod_by_tier(tier):
    """Ambil data pancingan berdasarkan tier"""
    for rod in RODS:
        if rod['tier'] == tier:
            return rod
    return RODS[0]

def calculate_exp_needed(level):
    """Hitung EXP yang dibutuhkan untuk naik level selanjutnya"""
    return int(100 * (level ** 1.5))

class FishingEngine:
    @staticmethod
    def catch_fish(user_id, username):
        """Logika utama memancing"""
        user = db.get_or_create_user(user_id, username)
        rod = get_rod_by_tier(user['rod_tier'])
        
        # 1. Cek Cooldown
        now = datetime.now(timezone.utc).timestamp()
        if user['last_catch']:
            elapsed = now - user['last_catch']
            if elapsed < rod['cooldown']:
                return {
                    "success": False,
                    "reason": "cooldown",
                    "remaining": rod['cooldown'] - elapsed
                }
        
        # 2. Layer 1: RNG Jenis Ikan
        # Filter ikan yang bisa ditangkap berdasarkan max_tier pancingan
        possible_fish = [f for f in FISH_DATA if f['tier'] <= rod['max_tier']]
        
        # Hitung weights berdasarkan base_chance + bonus pancingan + bonus luck
        weights = []
        for f in possible_fish:
            weight = f['base_chance']
            # Bonus pancingan: pancingan tinggi meningkatkan peluang ikan tier tinggi
            if f['tier'] > 1:
                # Faktor pengali untuk ikan langka berdasarkan rod tier
                # Pancing 1: 1.0x, Pancing 2: 2.0x, Pancing 3: 5.0x, Pancing 4: 10.0x
                rod_bonus_map = {1: 1.0, 2: 2.0, 3: 5.0, 4: 10.0}
                weight *= rod_bonus_map.get(user['rod_tier'], 1.0)
            
            # Bonus luck (user stat)
            if user['luck'] > 0:
                luck_bonus = 1 + (user['luck'] * 0.05) # 5% per luck point
                weight *= luck_bonus
                
            weights.append(weight)
        
        # Pilih ikan menggunakan weighted random
        selected_fish = random.choices(possible_fish, weights=weights, k=1)[0]
        
        # 3. Layer 2: RNG Berat Ikan
        # Power curve distribution: random()^2 atau random()^3 supaya berat maksimal jarang muncul
        # Semakin tinggi tier pancingan, semakin besar kecenderungan mendapat berat tinggi
        # Default: random()^2
        # Pancing Abyss: random()^1.2 (lebih mendekati linear, peluang berat besar lebih tinggi)
        power_map = {1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5}
        power = power_map.get(user['rod_tier'], 2.0)
        
        # Curve random value [0, 1]
        r = 1.0 - (random.random() ** power)
        
        weight_range = selected_fish['weight_max'] - selected_fish['weight_min']
        fish_weight = selected_fish['weight_min'] + (r * weight_range)
        
        # Luck bonus untuk berat (max 10% bonus)
        if user['luck'] > 0:
            weight_luck_bonus = min(1.1, 1 + (user['luck'] * 0.01))
            fish_weight *= weight_luck_bonus
        
        # Pembulatan
        fish_weight = round(fish_weight, 2)
        
        # 4. Kalkulasi Reward & Update DB
        price = int(fish_weight * selected_fish['price_per_kg'])
        
        # EXP Reward
        # Base EXP berdasarkan tier ikan
        tier_exp_map = {1: 10, 2: 25, 3: 75, 4: 250, 5: 1000, 6: 5000, 7: 25000}
        base_exp = tier_exp_map.get(selected_fish['tier'], 10)
        # Bonus EXP dari berat
        weight_bonus_exp = int(fish_weight * 0.5)
        total_exp_gain = base_exp + weight_bonus_exp
        
        # Update User Data
        db.update_last_catch(user_id)
        db.update_user_exp(user_id, total_exp_gain)
        db.add_to_inventory(user_id, selected_fish['id'], fish_weight)
        
        # Cek Level Up
        new_user = db.get_user(user_id)
        current_level = new_user['level']
        exp_needed = calculate_exp_needed(current_level)
        
        level_up = False
        if new_user['exp'] >= exp_needed:
            # Level Up!
            level_up = True
            db.update_user_level(user_id, current_level + 1)
            # Bonus koin per level up
            bonus_coins = 100 * (current_level + 1)
            db.update_user_coins(user_id, bonus_coins)
            # Bonus luck setiap 5 level
            if (current_level + 1) % 5 == 0:
                db.update_user_luck(user_id, db.get_user(user_id)['luck'] + 1)
        
        # Update statistik
        cursor = db.conn.cursor()
        cursor.execute("UPDATE users SET total_catches = total_catches + 1 WHERE user_id = ?", (user_id,))
        db.update_max_weight(user_id, fish_weight)
        db.conn.commit()
        
        return {
            "success": True,
            "fish": selected_fish,
            "weight": fish_weight,
            "price": price,
            "exp_gain": total_exp_gain,
            "level_up": level_up,
            "new_level": current_level + 1 if level_up else current_level,
            "bonus_coins": 100 * (current_level + 1) if level_up else 0
        }

    @staticmethod
    def sell_fish(user_id, inv_id):
        """Jual ikan dari inventory"""
        cursor = db.conn.cursor()
        cursor.execute('''
            SELECT i.*, f.price_per_kg, f.name 
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.id = ? AND i.user_id = ? AND i.sold = 0
        ''', (inv_id, user_id))
        
        item = cursor.fetchone()
        if not item:
            return {"success": False, "reason": "Item tidak ditemukan"}
        
        price = int(item['weight'] * item['price_per_kg'])
        
        # Update koin & inventory
        db.update_user_coins(user_id, price)
        cursor.execute("UPDATE inventory SET sold = 1 WHERE id = ?", (inv_id,))
        db.conn.commit()
        
        return {"success": True, "price": price, "fish_name": item['name']}

    @staticmethod
    def sell_all_by_tier(user_id, tier):
        """Jual semua ikan dengan tier tertentu"""
        cursor = db.conn.cursor()
        cursor.execute('''
            SELECT i.id, i.weight, f.price_per_kg
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.user_id = ? AND f.tier = ? AND i.sold = 0
        ''', (user_id, tier))
        
        items = cursor.fetchall()
        if not items:
            return {"success": False, "reason": f"Tidak ada ikan Tier {tier} di inventory"}
        
        total_price = 0
        count = 0
        for item in items:
            price = int(item['weight'] * item['price_per_kg'])
            total_price += price
            count += 1
            cursor.execute("UPDATE inventory SET sold = 1 WHERE id = ?", (item['id'],))
        
        db.update_user_coins(user_id, total_price)
        db.conn.commit()
        
        return {"success": True, "total_price": total_price, "count": count}

    @staticmethod
    def upgrade_luck(user_id):
        """Upgrade luck stat menggunakan koin"""
        user = db.get_user(user_id)
        # Biaya upgrade: 1000 * (luck + 1)^2
        cost = 1000 * ((user['luck'] + 1) ** 2)
        
        if user['coins'] < cost:
            return {"success": False, "reason": "Koin tidak cukup", "cost": cost}
        
        db.update_user_coins(user_id, -cost)
        db.update_user_luck(user_id, user['luck'] + 1)
        
        return {"success": True, "new_luck": user['luck'] + 1, "cost": cost}

    @staticmethod
    def buy_rod(user_id, rod_tier):
        """Beli pancingan"""
        user = db.get_user(user_id)
        rod = get_rod_by_tier(rod_tier)
        
        if user['rod_tier'] >= rod_tier:
            return {"success": False, "reason": "Kamu sudah punya pancingan yang lebih baik atau sama"}
        
        if user['coins'] < rod['price']:
            return {"success": False, "reason": "Koin tidak cukup", "cost": rod['price']}
        
        db.update_user_coins(user_id, -rod['price'])
        now = datetime.now(timezone.utc).timestamp()
        db.update_user_rod(user_id, rod_tier, now)
        
        return {"success": True, "rod_name": rod['name'], "cost": rod['price']}

    @staticmethod
    def claim_daily(user_id):
        """Klaim reward harian"""
        user = db.get_user(user_id)
        now = datetime.now(timezone.utc).timestamp()
        
        if user['last_daily']:
            # Cek apakah sudah 24 jam
            elapsed = now - user['last_daily']
            if elapsed < 86400: # 24 jam
                remaining = 86400 - elapsed
                return {"success": False, "reason": "cooldown", "remaining": remaining}
            
            # Cek streak (jika lebih dari 48 jam, streak reset)
            if elapsed > 172800: # 48 jam
                new_streak = 1
            else:
                new_streak = user['daily_streak'] + 1
        else:
            new_streak = 1
        
        # Reward: 100 + (streak * 50) koin + (streak * 20) EXP
        coin_reward = 100 + (new_streak * 50)
        exp_reward = 50 + (new_streak * 20)
        
        db.update_user_coins(user_id, coin_reward)
        db.update_user_exp(user_id, exp_reward)
        db.update_daily_streak(user_id, new_streak, now)
        
        return {
            "success": True, 
            "coins": coin_reward, 
            "exp": exp_reward, 
            "streak": new_streak
        }
