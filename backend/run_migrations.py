"""
Script to run all database migrations efficiently
"""
import os
import sys
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

# Import all migration modules
from migrations.add_assigned_to_user_id_column import run_migration as migration1
from migrations.add_category_column import run_migration as migration2
from migrations.add_notifications_table import upgrade as migration3
from migrations.add_order_index_column import run_migration as migration4
from migrations.add_priority_column import run_migration as migration5
from migrations.add_profile_pic_column import migrate as migration6
from migrations.add_role_column import run_migration as migration7
from migrations.remove_password_reset_fields import run_migration as migration8
from migrations.remove_user_email_settings import run_migration as migration9
from migrations.update_profile_pic_to_text import run_migration as migration10
from migrations.add_status_column import run_migration as migration11
from migrations.add_todo_comments_table import run_migration as migration12
from migrations.add_due_date_column import run_migration as migration13
from migrations.add_is_deleted_column import run_migration as migration17
from migrations.add_todo_comment_history_table import run_migration as migration18
from migrations.add_todo_field_history_table import run_migration as migration19
from migrations.remove_completed_column import run_migration as migration20
from migrations.add_reminder_sent_at_column import migrate as migration14
from migrations.add_verification_fields import run_migration as migration15
from migrations.add_comment_attachments import migrate as migration16
from migrations.add_created_at_index import run_migration as migration21
from migrations.add_password_reset_fields import run_migration as migration22
from migrations.add_time_estimate_column import run_migration as migration23
from migrations.add_time_logged_column import run_migration as migration24

from app.database import engine

def run_all_migrations():
    """Run all database migrations in order with minimal overhead"""
    # Check if we've already run migrations in this process
    if os.environ.get("MIGRATIONS_RUN"):
        return
        
    logger.info("🚀 Starting database migrations...")
    
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
        ("Add due_date column", migration13),
        ("Add is_deleted column", migration17),
        ("Add todo_comment_history table", migration18),
        ("Add todo_field_history table", migration19),
        ("Remove completed column", migration20),
        ("Add reminder_sent_at column", migration14),
        ("Add email verification fields", migration15),
        ("Add comment attachments", migration16),
        ("Add created_at index on todos", migration21),
        ("Add password reset fields", migration22),
        ("Add time_estimate column", migration23),
        ("Add time_logged column", migration24),
    ]
    
    # We don't open a session here because each migration opens its own
    # but we will set an environment variable to prevent re-runs if called multiple times
    try:
        for name, migration_func in migrations:
            try:
                # Most migrations currently open their own SessionLocal()
                migration_func()
            except Exception as e:
                logger.warning(f"⚠️  Migration '{name}' might have already been applied or failed: {e}")
                continue
        
        os.environ["MIGRATIONS_RUN"] = "true"
        logger.info("✅ All migrations checked/completed!")
    except Exception as e:
        logger.error(f"❌ Critical error during migrations: {e}")

if __name__ == "__main__":
    run_all_migrations()
