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
            result = db.execute(text("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'todos' AND COLUMN_NAME = 'time_logged'"))
            if result.scalar() == 0:
                print("Adding time_logged column to todos table...")
                db.execute(text("ALTER TABLE todos ADD COLUMN time_logged VARCHAR(50)"))
        elif "sqlite" in db_url:
            result = db.execute(text("PRAGMA table_info(todos)"))
            columns = [row[1] for row in result]
            if "time_logged" not in columns:
                print("Adding time_logged column to todos table...")
                db.execute(text("ALTER TABLE todos ADD COLUMN time_logged VARCHAR(50)"))
        db.commit()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
