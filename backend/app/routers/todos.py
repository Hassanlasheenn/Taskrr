from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from .. import database, models, schemas

router = APIRouter(prefix="/todos", tags=["todos"])


# Get all todos for a user
@router.get("", response_model=schemas.TodoListResponse)
def get_todos(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db)
):
    """Get all todos for a specific user, ordered by index"""
    todos = db.query(models.Todo).filter(
        models.Todo.user_id == user_id
    ).order_by(models.Todo.order_index.asc()).offset(skip).limit(limit).all()
    
    total = db.query(models.Todo).filter(models.Todo.user_id == user_id).count()
    
    return schemas.TodoListResponse(todos=todos, total=total)

# Create a new todo
@router.post("", response_model=schemas.TodoResponse, status_code=status.HTTP_201_CREATED)
def create_todo(
    todo: schemas.TodoCreate,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Create a new todo for a user"""
    # Verify user exists
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Get the next order index for this user
    max_index = db.query(func.max(models.Todo.order_index)).filter(
        models.Todo.user_id == user_id
    ).scalar()
    next_index = (max_index or 0) + 1
    
    db_todo = models.Todo(
        title=todo.title,
        description=todo.description,
        priority=todo.priority.value,
        order_index=next_index,
        user_id=user_id
    )
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo

@router.put("/{todo_id}", response_model=schemas.TodoResponse)
def update_todo(todo_id: int, todo: schemas.TodoUpdate, user_id: int, db: Session = Depends(database.get_db)):
    """Update a todo by ID"""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if todo_db.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to update this todo")
    if todo.title:
        todo_db.title = todo.title
    if todo.description is not None:
        todo_db.description = todo.description
    if todo.priority:
        todo_db.priority = todo.priority.value
    if todo.completed is not None:
        todo_db.completed = todo.completed
    db.commit()
    db.refresh(todo_db)
    return todo_db

@router.delete("/{todo_id}")
def delete_todo(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Delete a todo by ID and reorder remaining todos"""
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    
    if todo.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to delete this todo")

    deleted_index = todo.order_index
    db.delete(todo)
    
    # Reorder remaining todos - decrease index for all todos with higher index
    db.query(models.Todo).filter(
        models.Todo.user_id == user_id,
        models.Todo.order_index > deleted_index
    ).update({models.Todo.order_index: models.Todo.order_index - 1})
    
    db.commit()

    return {"message": "Todo deleted successfully"}
