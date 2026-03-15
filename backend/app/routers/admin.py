from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Dict
from .. import database, models, schemas
from ..dependencies import get_current_admin_user
from ..cache import cache_get, cache_set, invalidate_user_list_caches
from ..cache import PREFIX_ADMIN_USERS, PREFIX_ADMIN_USERS_WITH_TODOS
from ..config import CACHE_TTL_USER_LISTS
from .users import get_photo_url

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[schemas.UserListResponse])
def list_users(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    cached = cache_get(PREFIX_ADMIN_USERS)
    if cached is not None:
        for item in cached:
            item['photo'] = get_photo_url(request, item.get('photo'))
        return [schemas.UserListResponse(**item) for item in cached]
        
    users = db.query(models.User).all()
    result = [
        schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=get_photo_url(request, user.profile_pic),
            role=getattr(user, 'role', 'user'),
            is_verified=user.is_verified
        )
        for user in users
    ]
    
    # Cache raw paths
    cache_data = []
    for user in users:
        cache_data.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "photo": user.profile_pic,
            "role": getattr(user, 'role', 'user'),
            "is_verified": user.is_verified
        })
    cache_set(PREFIX_ADMIN_USERS, cache_data, CACHE_TTL_USER_LISTS)
    return result


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
    
    db.query(models.Notification).filter(models.Notification.user_id == user_id).delete()
    
    db.query(models.Todo).filter(models.Todo.assigned_to_user_id == user_id).update(
        {models.Todo.assigned_to_user_id: None}
    )
    
    db.delete(user)
    db.commit()
    invalidate_user_list_caches()
    return {"message": "User deleted successfully"}


@router.patch("/users/{user_id}/role", response_model=schemas.UserListResponse)
def update_user_role(
    request: Request,
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
    invalidate_user_list_caches()
    return schemas.UserListResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        photo=get_photo_url(request, user.profile_pic),
        role=user.role,
        is_verified=user.is_verified
    )


@router.get("/users-with-todos")
def get_users_with_todos(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Get all users with their todos (admin only) - shows todos owned by or assigned to each user"""
    cached = cache_get(PREFIX_ADMIN_USERS_WITH_TODOS)
    if cached is not None:
        for item in cached:
            item['user']['photo'] = get_photo_url(request, item['user'].get('photo'))
        return [
            {
                "user": schemas.UserListResponse(**item["user"]),
                "todos": [schemas.TodoResponse(**t) for t in item["todos"]],
                "todo_count": item["todo_count"],
            }
            for item in cached
        ]
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
                "status": todo.status or "new",
                "priority": todo.priority,
                "category": todo.category,
                "due_date": todo.due_date,
                "reminder_sent_at": todo.reminder_sent_at,
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
                photo=get_photo_url(request, user.profile_pic),
                role=getattr(user, 'role', 'user'),
                is_verified=user.is_verified
            ),
            "todos": todo_responses,
            "todo_count": len(todos)
        })
    # Serialize for cache (Pydantic models -> dicts)
    cacheable = []
    for item in result:
        # Keep raw photo path in cache
        user_db = db.query(models.User).filter(models.User.id == item["user"].id).first()
        raw_photo = user_db.profile_pic if user_db else None
        
        user_dict = item["user"].model_dump(mode="json")
        user_dict['photo'] = raw_photo
        
        cacheable.append({
            "user": user_dict,
            "todos": [t.model_dump(mode="json") for t in item["todos"]],
            "todo_count": item["todo_count"],
        })
    cache_set(PREFIX_ADMIN_USERS_WITH_TODOS, cacheable, CACHE_TTL_USER_LISTS)
    return result
