"""
Script to run all database migrations
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

# Import all migration modules
from migrations.add_assigned_to_user_id_column import run_migration as migration1
from migrations.add_category_column import run_migration as migration2
from migrations.add_notifications_table import upgrade as migration3  # Uses upgrade() instead
from migrations.add_order_index_column import run_migration as migration4
from migrations.add_priority_column import run_migration as migration5
from migrations.add_profile_pic_column import run_migration as migration6
from migrations.add_role_column import run_migration as migration7
from migrations.remove_password_reset_fields import run_migration as migration8
from migrations.remove_user_email_settings import run_migration as migration9
from migrations.update_profile_pic_to_text import run_migration as migration10
from migrations.add_status_column import run_migration as migration11
from migrations.add_todo_comments_table import run_migration as migration12

from app.database import SessionLocal

def run_all_migrations():
    """Run all database migrations in order"""
    print("🚀 Starting database migrations...")
    
    # List of migrations in order
    migrations = [
        ("Add assigned_to_user_id column", migration1),
        ("Add category column", migration2),
        ("Add notifications table", migration3),
        ("Add order_index column", migration4),
        ("Add priority column", migration5),
        ("Add profile_pic column", migration6),
        ("Add role column", migration7),
        ("Remove password reset fields", migration8),
        ("Remove user email settings", migration9),
        ("Update profile_pic to text", migration10),
        ("Add status column", migration11),
        ("Add todo_comments table", migration12),
    ]
    
    db = SessionLocal()
    try:
        for name, migration_func in migrations:
            print(f"\n📝 Running migration: {name}")
            try:
                migration_func()
                db.commit()
                print(f"✅ Migration '{name}' completed successfully")
            except Exception as e:
                print(f"⚠️  Migration '{name}' failed: {e}")
                # Continue with next migration
                db.rollback()
                continue
        
        print("\n✅ All migrations completed!")
    except Exception as e:
        print(f"❌ Error running migrations: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_all_migrations()
