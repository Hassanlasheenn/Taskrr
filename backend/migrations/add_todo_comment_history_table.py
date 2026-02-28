import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from sqlalchemy import text, inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from app.database import engine

load_dotenv()

TABLE_NAME = "todo_comment_history"
TODOS_TABLE = "todos"
USERS_TABLE = "users"


def run_migration():
    print("==================================================")
    print(f"Running migration: Add {TABLE_NAME} table")
    print("==================================================")

    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        inspector = inspect(engine)
        if inspector.has_table(TABLE_NAME):
            print(f"[INFO] Table '{TABLE_NAME}' already exists. Skipping migration.")
            return

        with engine.connect() as connection:
            connection.execute(text(f"""
                CREATE TABLE {TABLE_NAME} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    todo_id INTEGER NOT NULL,
                    comment_id INTEGER,
                    user_id INTEGER NOT NULL,
                    action VARCHAR(20) NOT NULL,
                    content_before TEXT,
                    content_after TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (todo_id) REFERENCES {TODOS_TABLE} (id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES {USERS_TABLE} (id) ON DELETE CASCADE
                )
            """))
            connection.execute(text(f"CREATE INDEX idx_todo_comment_history_todo_id ON {TABLE_NAME} (todo_id)"))
            connection.commit()

        print(f"[OK] Table '{TABLE_NAME}' created successfully.")
        session.commit()
        print("[OK] Migration completed successfully!")

    except OperationalError as e:
        session.rollback()
        print(f"[ERROR] Database Operational Error: {e}")
    except Exception as e:
        session.rollback()
        print(f"[ERROR] An unexpected error occurred: {e}")
    finally:
        session.close()


if __name__ == "__main__":
    run_migration()
