
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict
from .. import database, models, schemas
from ..dependencies import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[schemas.UserListResponse])
def list_users(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    users = db.query(models.User).all()
    return [
        schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=getattr(user, 'profile_pic', None),
            role=getattr(user, 'role', 'user')
        )
        for user in users
    ]


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Delete related notifications for this user
    db.query(models.Notification).filter(models.Notification.user_id == user_id).delete()
    
    # Handle todos assigned to this user (set assigned_to_user_id to NULL)
    db.query(models.Todo).filter(models.Todo.assigned_to_user_id == user_id).update(
        {models.Todo.assigned_to_user_id: None}
    )
    
    # Delete the user (todos owned by user will be cascade deleted via relationship)
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}


@router.patch("/users/{user_id}/role", response_model=schemas.UserListResponse)
def update_user_role(
    user_id: int,
    role_update: schemas.UserRoleUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role"
        )
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.role = role_update.role
    db.commit()
    db.refresh(user)
    
    return schemas.UserListResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        photo=getattr(user, 'profile_pic', None),
        role=user.role
    )


@router.get("/users-with-todos")
def get_users_with_todos(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Get all users with their todos (admin only) - shows todos owned by or assigned to each user"""
    from sqlalchemy import or_
    
    users = db.query(models.User).all()
    
    result = []
    for user in users:
        if user.role == models.UserRole.ADMIN.value:
            todos = db.query(models.Todo).filter(
                models.Todo.user_id == user.id,
                models.Todo.assigned_to_user_id.is_(None)
            ).order_by(models.Todo.order_index.asc()).all()
        else:
            todos = db.query(models.Todo).filter(
                or_(
                    models.Todo.user_id == user.id,
                    models.Todo.assigned_to_user_id == user.id
                )
            ).order_by(models.Todo.order_index.asc()).all()
        
        todo_responses = []
        for todo in todos:
            assigned_to_username = None
            if todo.assigned_to_user_id:
                assigned_user = db.query(models.User).filter(
                    models.User.id == todo.assigned_to_user_id
                ).first()
                if assigned_user:
                    assigned_to_username = assigned_user.username
            
            todo_dict = {
                "id": todo.id,
                "title": todo.title,
                "description": todo.description,
                "completed": todo.completed,
                "priority": todo.priority,
                "category": todo.category,
                "order_index": todo.order_index,
                "created_at": todo.created_at,
                "updated_at": todo.updated_at,
                "user_id": todo.user_id,
                "assigned_to_user_id": todo.assigned_to_user_id,
                "assigned_to_username": assigned_to_username
            }
            todo_responses.append(schemas.TodoResponse(**todo_dict))
        
        result.append({
            "user": schemas.UserListResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                photo=getattr(user, 'profile_pic', None),
                role=getattr(user, 'role', 'user')
            ),
            "todos": todo_responses,
            "todo_count": len(todos)
        })
    
    return result
