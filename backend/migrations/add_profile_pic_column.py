"""
Migration script to add profile_pic column to users table.
Run this script once to update your database schema.

Usage:
    python migrations/add_profile_pic_column.py
"""
import os
import sys
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

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
    """Add profile_pic column to users table if it doesn't exist"""
    try:
        with engine.connect() as conn:
            # Check database type and execute appropriate SQL
            db_type = DATABASE_URL.split("://")[0].lower()
            
            if 'mssql' in db_type or 'sqlserver' in db_type:
                # SQL Server
                conn.execute(text("""
                    IF NOT EXISTS (
                        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_pic'
                    )
                    BEGIN
                        ALTER TABLE users ADD profile_pic VARCHAR(500) NULL;
                    END
                """))
            elif 'postgresql' in db_type or 'postgres' in db_type:
                # PostgreSQL
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS profile_pic VARCHAR(500) NULL;
                """))
            elif 'mysql' in db_type or 'mariadb' in db_type:
                # MySQL/MariaDB
                try:
                    conn.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN profile_pic VARCHAR(500) NULL;
                    """))
                except Exception as e:
                    if 'duplicate' in str(e).lower():
                        print("[INFO] Column profile_pic already exists")
                    else:
                        raise
            else:
                # SQLite (default)
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN profile_pic VARCHAR(500);
                """))
            
            conn.commit()
            print("[SUCCESS] Successfully added profile_pic column to users table")
            
    except Exception as e:
        # Column might already exist, check the error
        error_msg = str(e).lower()
        if any(keyword in error_msg for keyword in ['already exists', 'duplicate', 'existing']):
            print("[INFO] Column profile_pic already exists in users table")
        else:
            print(f"[ERROR] Error migrating database: {e}")
            print("\nYou may need to manually add the column:")
            print("ALTER TABLE users ADD COLUMN profile_pic VARCHAR(500) NULL;")
            raise

if __name__ == "__main__":
    print("Running database migration: Add profile_pic column...")
    print("-" * 50)
    migrate()
    print("-" * 50)
    print("[SUCCESS] Migration complete!")

