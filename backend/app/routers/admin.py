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
        result = []
        for item in cached:
            item['photo'] = get_photo_url(request, item.get('photo'))
            # Ensure role is always present
            if not item.get('role'):
                item['role'] = 'user'
            try:
                result.append(schemas.UserListResponse(**item))
            except Exception as e:
                # Log error and skip invalid items
                import logging
                logging.getLogger(__name__).error(f"Cache data error for user {item.get('id')}: {e}")
                continue
        return result
        
    users = db.query(models.User).all()
    result = []
    for user in users:
        result.append(schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=get_photo_url(request, user.profile_pic),
            role=getattr(user, 'role', 'user') or 'user',
            is_verified=user.is_verified
        ))
    
    # Cache raw paths
    cache_data = []
    for user in users:
        cache_data.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "photo": user.profile_pic,
            "role": getattr(user, 'role', 'user') or 'user',
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


@router.get("/users-with-todos", response_model=List[schemas.UserWithTodosResponse])
def get_users_with_todos(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Get all users with their todos (admin only) - shows todos owned by or assigned to each user"""
    import logging
    logger = logging.getLogger(__name__)
    
    cached = cache_get(PREFIX_ADMIN_USERS_WITH_TODOS)
    if cached is not None:
        result = []
        for item in cached:
            try:
                # Ensure 'user' and 'todos' keys exist
                user_data = item.get('user')
                if not user_data:
                    continue
                
                # Dynamic full URL for photo
                user_data['photo'] = get_photo_url(request, user_data.get('photo'))
                if not user_data.get('role'):
                    user_data['role'] = 'user'
                
                # Provide defaults for mandatory bool fields if missing
                if user_data.get('is_verified') is None:
                    user_data['is_verified'] = False
                
                # Ensure todos is a list and provide defaults for each todo
                todos_data = item.get('todos', [])
                valid_todos = []
                for t in todos_data:
                    try:
                        if not t.get('status'): t['status'] = 'new'
                        if not t.get('priority'): t['priority'] = 'medium'
                        # Ensure mandatory int fields are present
                        if t.get('id') is None or t.get('user_id') is None:
                            continue
                        valid_todos.append(schemas.TodoResponse(**t))
                    except Exception as te:
                        logger.warning(f"Skipping malformed cached todo: {te}")
                        continue
                
                result.append(schemas.UserWithTodosResponse(
                    user=schemas.UserListResponse(**user_data),
                    todos=valid_todos,
                    todo_count=item.get("todo_count", len(valid_todos)),
                ))
            except Exception as e:
                logger.error(f"Cache data error for user {item.get('user', {}).get('id')}: {e}")
                continue
        return result

    from sqlalchemy import or_
    users = db.query(models.User).all()
    
    result = []
    for user in users:
        # Include todos where user is owner OR assignee
        # This ensures all users (including admins) show their relevant todos
        todos = db.query(models.Todo).filter(
            or_(
                models.Todo.user_id == user.id,
                models.Todo.assigned_to_user_id == user.id
            )
        ).order_by(models.Todo.order_index.asc()).all()
        
        todo_responses = []
        for todo in todos:
            try:
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
                    "priority": todo.priority or "medium",
                    "category": todo.category,
                    "due_date": todo.due_date,
                    "reminder_sent_at": todo.reminder_sent_at,
                    "order_index": todo.order_index or 0,
                    "created_at": todo.created_at,
                    "updated_at": todo.updated_at,
                    "user_id": todo.user_id,
                    "assigned_to_user_id": todo.assigned_to_user_id,
                    "assigned_to_username": assigned_to_username
                }
                todo_responses.append(schemas.TodoResponse(**todo_dict))
            except Exception as e:
                logger.error(f"Pydantic validation error for todo {getattr(todo, 'id', 'unknown')}: {e}")
                continue
        
        try:
            user_list_data = {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "photo": get_photo_url(request, user.profile_pic),
                "role": getattr(user, 'role', 'user') or 'user',
                "is_verified": bool(user.is_verified)
            }
            
            result.append(schemas.UserWithTodosResponse(
                user=schemas.UserListResponse(**user_list_data),
                todos=todo_responses,
                todo_count=len(todo_responses)
            ))
        except Exception as e:
            logger.error(f"Pydantic validation error for user {user.id}: {e}")
            continue

    # Serialize for cache (Pydantic models -> dicts)
    cacheable = []
    for item in result:
        # Keep raw photo path in cache for dynamic URL generation later
        user_db = db.query(models.User).filter(models.User.id == item.user.id).first()
        raw_photo = user_db.profile_pic if user_db else None
        
        user_dict = item.user.model_dump(mode="json")
        user_dict['photo'] = raw_photo # Raw path/URL for cache
        
        cacheable.append({
            "user": user_dict,
            "todos": [t.model_dump(mode="json") for t in item.todos],
            "todo_count": item.todo_count,
        })
    cache_set(PREFIX_ADMIN_USERS_WITH_TODOS, cacheable, CACHE_TTL_USER_LISTS)
    return result
