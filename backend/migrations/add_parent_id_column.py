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
            result = db.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'todos' AND COLUMN_NAME = 'parent_id'"
            ))
            if result.scalar() == 0:
                print("Adding parent_id column to todos table...")
                db.execute(text(
                    "ALTER TABLE todos ADD COLUMN parent_id INTEGER "
                    "REFERENCES todos(id) ON DELETE SET NULL"
                ))
                db.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_todos_parent_id ON todos(parent_id)"
                ))
        elif "sqlite" in db_url:
            result = db.execute(text("PRAGMA table_info(todos)"))
            columns = [row[1] for row in result]
            if "parent_id" not in columns:
                print("Adding parent_id column to todos table...")
                db.execute(text("ALTER TABLE todos ADD COLUMN parent_id INTEGER"))
        db.commit()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
