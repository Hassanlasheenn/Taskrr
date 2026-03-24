from sqlalchemy import text
from app.database import engine

def migrate():
    print("Adding reminder_sent_at column to todos table...")
    
    db_url = str(engine.url).lower()
    
    try:
        with engine.connect() as conn:
            if 'postgresql' in db_url or 'postgres' in db_url:
                # PostgreSQL supports IF NOT EXISTS for columns since version 9.6
                conn.execute(text("ALTER TABLE todos ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;"))
            elif 'sqlite' in db_url:
                # SQLite doesn't support IF NOT EXISTS for columns, must check first
                # or just catch the exception (which we already do)
                try:
                    conn.execute(text("ALTER TABLE todos ADD COLUMN reminder_sent_at DATETIME;"))
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        print("Column reminder_sent_at already exists in SQLite, skipping.")
                    else:
                        raise e
            else:
                # Generic fallback
                try:
                    conn.execute(text("ALTER TABLE todos ADD COLUMN reminder_sent_at TIMESTAMP;"))
                except Exception as e:
                    if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                        print("Column reminder_sent_at already exists, skipping.")
                    else:
                        raise e
            
            conn.commit()
            print("Successfully handled reminder_sent_at column.")
    except Exception as e:
        print(f"Migration error for reminder_sent_at: {e}")

if __name__ == "__main__":
    migrate()
