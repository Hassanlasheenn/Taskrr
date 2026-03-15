"""
Migration script to add is_verified and verification_token columns to users table
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from app.database import engine, SessionLocal

def run_migration():
    """Add is_verified and verification_token columns to users table"""
    db = SessionLocal()
    
    try:
        db_url = str(engine.url).lower()
        print(f"Database detected: {db_url[:50]}...")
        
        # Check if columns exist
        if 'postgresql' in db_url or 'postgres' in db_url:
            # Check is_verified
            result = db.execute(text("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'is_verified'
            """))
            if result.scalar() == 0:
                print("[...] Adding is_verified column...")
                db.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT FALSE NOT NULL"))
            else:
                print("[OK] is_verified column already exists.")
            
            # Check verification_token
            result = db.execute(text("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'verification_token'
            """))
            if result.scalar() == 0:
                print("[...] Adding verification_token column...")
                db.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255)"))
                db.execute(text("CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token)"))
            else:
                print("[OK] verification_token column already exists.")
                
        elif 'sqlite' in db_url:
            result = db.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result]
            
            if 'is_verified' not in columns:
                print("[...] Adding is_verified column...")
                db.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0 NOT NULL"))
            
            if 'verification_token' not in columns:
                print("[...] Adding verification_token column...")
                db.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255)"))
            
        db.commit()
        print("[OK] Migration completed successfully!")
        
    except Exception as e:
        print(f"[ERROR] Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 50)
    print("Running migration: Add verification fields to users")
    print("=" * 50)
    run_migration()
