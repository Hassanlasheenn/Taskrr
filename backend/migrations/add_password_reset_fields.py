import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine, SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        db_url = str(engine.url).lower()
        if "postgresql" in db_url or "postgres" in db_url:
            # Fix: Use single quotes for string literals in SQL
            result = db.execute(text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \u0027users\u0027 AND COLUMN_NAME = \u0027reset_password_token\u0027"))
            if result.scalar() == 0:
                print("Adding reset_password_token column...")
                db.execute(text("ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255)"))
                db.execute(text("CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token)"))
            
            result = db.execute(text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \u0027users\u0027 AND COLUMN_NAME = \u0027reset_password_expires\u0027"))
            if result.scalar() == 0:
                print("Adding reset_password_expires column...")
                db.execute(text("ALTER TABLE users ADD COLUMN reset_password_expires TIMESTAMP"))
        elif "sqlite" in db_url:
            result = db.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result]
            if "reset_password_token" not in columns:
                db.execute(text("ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255)"))
            if "reset_password_expires" not in columns:
                db.execute(text("ALTER TABLE users ADD COLUMN reset_password_expires DATETIME"))
        db.commit()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
