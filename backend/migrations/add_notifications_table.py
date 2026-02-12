import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from sqlalchemy import Column, Integer, Text, Boolean, ForeignKey, DateTime, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError
from sqlalchemy import inspect
from app.database import engine

load_dotenv()

TABLE_NAME = "notifications"
USERS_TABLE = "users"
TODOS_TABLE = "todos"

def upgrade():
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
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    todo_id INTEGER,
                    message TEXT NOT NULL,
                    is_read BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES {USERS_TABLE} (id) ON DELETE CASCADE,
                    FOREIGN KEY (todo_id) REFERENCES {TODOS_TABLE} (id) ON DELETE SET NULL
                )
            """))
            connection.execute(text(f"CREATE INDEX idx_notifications_user_id ON {TABLE_NAME} (user_id)"))
            connection.execute(text(f"CREATE INDEX idx_notifications_is_read ON {TABLE_NAME} (is_read)"))
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
    upgrade()
