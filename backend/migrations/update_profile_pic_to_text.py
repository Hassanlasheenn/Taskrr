"""
Migration script to update profile_pic column from VARCHAR to TEXT
This allows storing base64 encoded images directly in the database
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from app.database import engine, SessionLocal

def run_migration():
    """Update profile_pic column to TEXT type for base64 storage"""
    db = SessionLocal()
    
    try:
        # Check the database type
        db_url = str(engine.url).lower()
        print(f"Database URL detected: {db_url[:50]}...")
        
        if 'sqlite' in db_url:
            # SQLite doesn't support ALTER COLUMN, TEXT and VARCHAR are treated the same
            # Clear any existing file paths since they won't work with the new system
            print("SQLite detected - clearing existing file path references...")
            db.execute(text("UPDATE users SET profile_pic = NULL WHERE profile_pic IS NOT NULL AND profile_pic NOT LIKE 'data:%'"))
            db.commit()
            print("Migration completed successfully!")
            
        elif 'mysql' in db_url or 'mariadb' in db_url:
            # MySQL/MariaDB
            print("MySQL/MariaDB detected - altering column type...")
            db.execute(text("ALTER TABLE users MODIFY COLUMN profile_pic LONGTEXT"))
            # Clear file paths
            db.execute(text("UPDATE users SET profile_pic = NULL WHERE profile_pic IS NOT NULL AND profile_pic NOT LIKE 'data:%'"))
            db.commit()
            print("Migration completed successfully!")
            
        elif 'postgresql' in db_url or 'postgres' in db_url:
            # PostgreSQL
            print("PostgreSQL detected - altering column type...")
            db.execute(text("ALTER TABLE users ALTER COLUMN profile_pic TYPE TEXT"))
            # Clear file paths
            db.execute(text("UPDATE users SET profile_pic = NULL WHERE profile_pic IS NOT NULL AND profile_pic NOT LIKE 'data:%'"))
            db.commit()
            print("Migration completed successfully!")
        
        elif 'mssql' in db_url or 'sqlserver' in db_url:
            # Microsoft SQL Server
            print("SQL Server detected - altering column type...")
            db.execute(text("ALTER TABLE users ALTER COLUMN profile_pic NVARCHAR(MAX)"))
            # Clear file paths
            db.execute(text("UPDATE users SET profile_pic = NULL WHERE profile_pic IS NOT NULL AND profile_pic NOT LIKE 'data:%'"))
            db.commit()
            print("Migration completed successfully!")
            
        else:
            print(f"Database type not auto-detected from URL: {db_url}")
            print("Attempting generic update...")
            # Try to clear file paths anyway
            db.execute(text("UPDATE users SET profile_pic = NULL WHERE profile_pic IS NOT NULL AND profile_pic NOT LIKE 'data:%'"))
            db.commit()
            print("Cleared existing file path references.")
            print("Note: You may need to manually alter the column type to TEXT/LONGTEXT for large images.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Starting migration: Update profile_pic column to TEXT...")
    run_migration()

