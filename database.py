#!/usr/bin/env python3
"""
Database Manager untuk Fishing Bot
SQLite untuk menyimpan user data, inventory, dan catch log
"""

import sqlite3
import os
import json
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "fishing.db")


class Database:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.create_tables()
        self.load_fish_data()
    
    def create_tables(self):
        """Create all necessary tables"""
        cursor = self.conn.cursor()
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                coins INTEGER DEFAULT 100,
                exp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                rod_tier INTEGER DEFAULT 1,
                luck INTEGER DEFAULT 0,
                total_catches INTEGER DEFAULT 0,
                last_catch REAL,
                daily_streak INTEGER DEFAULT 0,
                last_daily REAL,
                registered_at REAL,
                max_weight_caught REAL DEFAULT 0,
                username_history TEXT DEFAULT '[]'
            )
        ''')
        
        # Inventory table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                fish_id TEXT,
                weight REAL,
                caught_at REAL,
                sold INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (fish_id) REFERENCES fish(id)
            )
        ''')
        
        # User rods table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_rods (
                user_id INTEGER PRIMARY KEY,
                rod_tier INTEGER DEFAULT 1,
                acquired_at REAL,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        ''')
        
        # Catch log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS catch_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                fish_id TEXT,
                weight REAL,
                tier INTEGER,
                caught_at REAL,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (fish_id) REFERENCES fish(id)
            )
        ''')
        
        # Fish table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS fish (
                id TEXT PRIMARY KEY,
                name TEXT,
                tier INTEGER,
                tier_name TEXT,
                weight_min REAL,
                weight_max REAL,
                price_per_kg REAL,
                emoji TEXT,
                description TEXT,
                base_chance REAL
            )
        ''')
        
        self.conn.commit()
    
    def load_fish_data(self):
        """Load fish data from JSON if not exists"""
        cursor = self.conn.cursor()
        
        # Check if fish data already exists
        cursor.execute("SELECT COUNT(*) FROM fish")
        count = cursor.fetchone()[0]
        
        if count == 0:
            # Load from JSON file
            fish_data_path = os.path.join(os.path.dirname(__file__), "fish_data.json")
            if os.path.exists(fish_data_path):
                with open(fish_data_path, 'r', encoding='utf-8') as f:
                    fish_data = json.load(f)
                
                for fish in fish_data:
                    cursor.execute('''
                        INSERT OR REPLACE INTO fish 
                        (id, name, tier, tier_name, weight_min, weight_max, price_per_kg, emoji, description, base_chance)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        fish['id'],
                        fish['name'],
                        fish['tier'],
                        fish['tier_name'],
                        fish['weight_min'],
                        fish['weight_max'],
                        fish['price_per_kg'],
                        fish['emoji'],
                        fish['description'],
                        fish['base_chance']
                    ))
                self.conn.commit()
    
    # ========== User Methods ==========
    
    def get_or_create_user(self, user_id, username):
        """Get or create user"""
        cursor = self.conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        
        if row is None:
            # Create new user
            now = datetime.now(timezone.utc).timestamp()
            cursor.execute('''
                INSERT INTO users 
                (user_id, username, registered_at, username_history)
                VALUES (?, ?, ?, ?)
            ''', (user_id, username, now, json.dumps([username])))
            
            # Create user_rods entry
            cursor.execute('''
                INSERT INTO user_rods (user_id, rod_tier, acquired_at)
                VALUES (?, 1, ?)
            ''', (user_id, now))
            
            self.conn.commit()
            return self.get_user(user_id)
        
        return dict(row)
    
    def get_user(self, user_id):
        """Get user by ID"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def update_user_coins(self, user_id, amount):
        """Update user coins"""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET coins = coins + ? WHERE user_id = ?",
            (amount, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_user_exp(self, user_id, exp):
        """Add experience to user"""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET exp = exp + ? WHERE user_id = ?",
            (exp, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_user_level(self, user_id, level):
        """Update user level"""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET level = ? WHERE user_id = ?",
            (level, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_user_rod(self, user_id, rod_tier, acquired_at):
        """Update user rod tier"""
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO user_rods (user_id, rod_tier, acquired_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET rod_tier = ?, acquired_at = ?
        ''', (user_id, rod_tier, acquired_at, rod_tier, acquired_at))
        cursor.execute(
            "UPDATE users SET rod_tier = ? WHERE user_id = ?",
            (rod_tier, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_user_luck(self, user_id, luck):
        """Update user luck stat"""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET luck = ? WHERE user_id = ?",
            (luck, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_last_catch(self, user_id):
        """Update last catch timestamp"""
        cursor = self.conn.cursor()
        now = datetime.now(timezone.utc).timestamp()
        cursor.execute(
            "UPDATE users SET last_catch = ? WHERE user_id = ?",
            (now, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_daily_streak(self, user_id, new_streak, new_last_daily):
        """Update daily streak and last daily timestamp"""
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE users SET daily_streak = ?, last_daily = ? WHERE user_id = ?
        ''', (new_streak, new_last_daily, user_id))
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_max_weight(self, user_id, weight):
        """Update max weight caught by user"""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE users SET max_weight_caught = MAX(COALESCE(max_weight_caught, 0), ?) WHERE user_id = ?",
            (weight, user_id)
        )
        self.conn.commit()
        return self.get_user(user_id)
    
    def update_username(self, user_id, new_username):
        """Update username and track history"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT username_history FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        history = json.loads(row['username_history']) if row and row['username_history'] else []
        
        if new_username not in history:
            history.append(new_username)
            cursor.execute(
                "UPDATE users SET username = ?, username_history = ? WHERE user_id = ?",
                (new_username, json.dumps(history), user_id)
            )
            self.conn.commit()
    
    # ========== Inventory Methods ==========
    
    def add_to_inventory(self, user_id, fish_id, weight):
        """Add caught fish to inventory"""
        cursor = self.conn.cursor()
        now = datetime.now(timezone.utc).timestamp()
        cursor.execute('''
            INSERT INTO inventory (user_id, fish_id, weight, caught_at)
            VALUES (?, ?, ?, ?)
        ''', (user_id, fish_id, weight, now))
        self.conn.commit()
        return cursor.lastrowid
    
    def get_inventory(self, user_id, page=1, per_page=5):
        """Get user inventory with pagination"""
        cursor = self.conn.cursor()
        offset = (page - 1) * per_page
        
        cursor.execute('''
            SELECT i.*, f.name, f.tier, f.tier_name, f.price_per_kg, f.emoji
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.user_id = ? AND i.sold = 0
            ORDER BY i.caught_at DESC
            LIMIT ? OFFSET ?
        ''', (user_id, per_page, offset))
        
        rows = cursor.fetchall()
        items = [dict(row) for row in rows]
        
        # Get total count
        cursor.execute('''
            SELECT COUNT(*) as total FROM inventory 
            WHERE user_id = ? AND sold = 0
        ''', (user_id,))
        total = cursor.fetchone()['total']
        
        return items, total
    
    def sell_inventory_item(self, item_id):
        """Mark inventory item as sold"""
        cursor = self.conn.cursor()
        cursor.execute("UPDATE inventory SET sold = 1 WHERE id = ?", (item_id,))
        self.conn.commit()
        return cursor.rowcount > 0
    
    def sell_all_tier(self, user_id, tier):
        """Sell all fish of a specific tier"""
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE inventory SET sold = 1 
            WHERE user_id = ? AND fish_id IN (
                SELECT id FROM fish WHERE tier = ?
            ) AND sold = 0
        ''', (user_id, tier))
        self.conn.commit()
        return cursor.rowcount
    
    # ========== Catch Log Methods ==========
    
    def add_catch_log(self, user_id, fish_id, weight, tier):
        """Add catch to log"""
        cursor = self.conn.cursor()
        now = datetime.now(timezone.utc).timestamp()
        cursor.execute('''
            INSERT INTO catch_log (user_id, fish_id, weight, tier, caught_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, fish_id, weight, tier, now))
        self.conn.commit()
        return cursor.lastrowid
    
    # ========== Fishing Stats ==========
    
    def get_fishing_stats(self, user_id):
        """Get fishing statistics for user"""
        cursor = self.conn.cursor()
        
        cursor.execute('''
            SELECT 
                COUNT(*) as total_catches,
                COALESCE(SUM(f.price_per_kg * i.weight), 0) as potential_earnings,
                COALESCE(MAX(i.weight), 0) as max_weight
            FROM inventory i
            JOIN fish f ON i.fish_id = f.id
            WHERE i.user_id = ? AND i.sold = 0
        ''', (user_id,))
        
        stats = cursor.fetchone()
        return dict(stats) if stats else None
    
    def get_leaderboard(self, limit=10):
        """Get top players by coins or level"""
        cursor = self.conn.cursor()
        
        # Top by coins
        cursor.execute('''
            SELECT username, coins, level, total_catches, max_weight_caught
            FROM users
            ORDER BY coins DESC
            LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    
    def get_leaderboard_by_level(self, limit=10):
        """Get top players by level"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT username, coins, level, exp, total_catches
            FROM users
            ORDER BY level DESC, exp DESC
            LIMIT ?
        ''', (limit,))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    
    # ========== Utility ==========
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def __del__(self):
        self.close()


# Global instance
db = Database()
