"""
Migration script to add is_deleted column to todos table
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine, SessionLocal

def run_migration():
    """Add is_deleted column to todos table"""
    db = SessionLocal()

    try:
        db_url = str(engine.url).lower()
        print(f"Database detected: {db_url[:50]}...")

        # Check if column already exists
        if 'mssql' in db_url or 'sqlserver' in db_url:
            result = db.execute(text("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'todos' AND COLUMN_NAME = 'is_deleted'
            """))
            if result.scalar() > 0:
                print("[OK] is_deleted column already exists. Skipping.")
                return

            print("[...] Adding is_deleted column...")
            db.execute(text("ALTER TABLE todos ADD is_deleted BIT NOT NULL DEFAULT 0"))

        elif 'sqlite' in db_url:
            result = db.execute(text("PRAGMA table_info(todos)"))
            columns = [row[1] for row in result]
            if 'is_deleted' in columns:
                print("[OK] is_deleted column already exists. Skipping.")
                return

            print("[...] Adding is_deleted column...")
            db.execute(text("ALTER TABLE todos ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))

        elif 'mysql' in db_url or 'mariadb' in db_url:
            print("[...] Adding is_deleted column...")
            db.execute(text("ALTER TABLE todos ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

        elif 'postgresql' in db_url or 'postgres' in db_url:
            print("[...] Adding is_deleted column...")
            db.execute(text("ALTER TABLE todos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

        else:
            print(f"[ERROR] Unknown database type. Please manually add the is_deleted column.")
            return

        db.commit()
        print("[OK] is_deleted column added successfully!")
        print("[SUCCESS] Migration completed successfully!")

    except Exception as e:
        print(f"[ERROR] Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 50)
    print("Running migration: Add is_deleted column to todos")
    print("=" * 50)
    run_migration()
