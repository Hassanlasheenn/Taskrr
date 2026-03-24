"""
Migration script to add attachment columns to todo_comments table.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in environment variables")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

def migrate():
    """Add attachment_url and attachment_name columns to todo_comments table if they don't exist"""
    try:
        with engine.connect() as conn:
            # Check database type and execute appropriate SQL
            db_type = DATABASE_URL.split("://")[0].lower()
            
            if 'mssql' in db_type or 'sqlserver' in db_type:
                # SQL Server
                conn.execute(text("""
                    IF NOT EXISTS (
                        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = 'todo_comments' AND COLUMN_NAME = 'attachment_url'
                    )
                    BEGIN
                        ALTER TABLE todo_comments ADD attachment_url VARCHAR(500) NULL;
                        ALTER TABLE todo_comments ADD attachment_name VARCHAR(255) NULL;
                    END
                """))
            elif 'postgresql' in db_type or 'postgres' in db_type:
                # PostgreSQL
                conn.execute(text("""
                    ALTER TABLE todo_comments 
                    ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500) NULL,
                    ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255) NULL;
                """))
            elif 'mysql' in db_type or 'mariadb' in db_type:
                # MySQL/MariaDB
                try:
                    conn.execute(text("""
                        ALTER TABLE todo_comments 
                        ADD COLUMN attachment_url VARCHAR(500) NULL,
                        ADD COLUMN attachment_name VARCHAR(255) NULL;
                    """))
                except Exception as e:
                    if 'duplicate' in str(e).lower():
                        print("[INFO] Attachment columns might already exist")
                    else:
                        raise
            else:
                # SQLite (default)
                conn.execute(text("""
                    ALTER TABLE todo_comments 
                    ADD COLUMN attachment_url VARCHAR(500);
                    ALTER TABLE todo_comments 
                    ADD COLUMN attachment_name VARCHAR(255);
                """))
            
            conn.commit()
            print("[SUCCESS] Successfully added attachment columns to todo_comments table")
            
    except Exception as e:
        print(f"[ERROR] Error migrating database: {e}")
        raise

if __name__ == "__main__":
    print("Running database migration: Add comment attachments...")
    migrate()
