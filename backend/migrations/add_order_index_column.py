"""
Migration script to add order_index column to todos table.
Run this script to update the database schema.
"""
import os
import sys

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine, SessionLocal


def run_migration():
    """Add order_index column to todos table"""
    
    db = SessionLocal()
    
    try:
        # Check if column already exists
        check_query = text("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'todos' 
            AND COLUMN_NAME = 'order_index'
        """)
        
        result = db.execute(check_query).scalar()
        
        if result > 0:
            print("[OK] Column 'order_index' already exists in 'todos' table")
            return
        
        # Add the order_index column
        print("[...] Adding 'order_index' column to 'todos' table...")
        
        alter_query = text("""
            ALTER TABLE todos 
            ADD order_index INT DEFAULT 0
        """)
        
        db.execute(alter_query)
        db.commit()
        print("[OK] Column 'order_index' added successfully")
        
        # Update existing todos with sequential order_index per user
        print("[...] Updating existing todos with order indices...")
        
        # Get all unique user_ids
        users_query = text("SELECT DISTINCT user_id FROM todos")
        users = db.execute(users_query).fetchall()
        
        for (user_id,) in users:
            # Get all todos for this user ordered by created_at
            todos_query = text("""
                SELECT id FROM todos 
                WHERE user_id = :user_id 
                ORDER BY created_at ASC
            """)
            todos = db.execute(todos_query, {"user_id": user_id}).fetchall()
            
            # Update each todo with its index
            for index, (todo_id,) in enumerate(todos, start=1):
                update_query = text("""
                    UPDATE todos 
                    SET order_index = :order_index 
                    WHERE id = :todo_id
                """)
                db.execute(update_query, {"order_index": index, "todo_id": todo_id})
        
        db.commit()
        print(f"[OK] Updated order indices for {len(users)} user(s)")
        
        print("[SUCCESS] Migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Migration failed: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 50)
    print("Running migration: Add order_index column to todos")
    print("=" * 50)
    run_migration()

