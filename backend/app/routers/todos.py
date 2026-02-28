from fastapi import APIRouter, Depends, HTTPException, status
# Removed BackgroundTasks to fix the closed session issue
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List
from .. import database, models, schemas
from ..routers.notifications import create_notification
from ..services.notification_service import notification_manager
from ..services.email_service import EmailService

router = APIRouter(prefix="/todos", tags=["todos"])

email_service = EmailService()


@router.get("", response_model=schemas.TodoListResponse)
def get_todos(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db)
):
    todos = db.query(models.Todo).filter(
        or_(
            models.Todo.user_id == user_id,
            models.Todo.assigned_to_user_id == user_id
        )
    ).distinct().order_by(models.Todo.order_index.asc()).offset(skip).limit(limit).all()
    
    total = db.query(models.Todo).filter(
        or_(
            models.Todo.user_id == user_id,
            models.Todo.assigned_to_user_id == user_id
        )
    ).count()
    
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
            "status": todo.status or models.TodoStatus.NEW.value,
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
    
    return schemas.TodoListResponse(todos=todo_responses, total=total)


@router.post("", response_model=schemas.TodoResponse, status_code=status.HTTP_201_CREATED)
async def create_todo(
    todo: schemas.TodoCreate,
    user_id: int,
    # Removed background_tasks
    db: Session = Depends(database.get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    max_index = db.query(func.max(models.Todo.order_index)).filter(
        models.Todo.user_id == user_id
    ).scalar()
    next_index = (max_index or 0) + 1
    
    assigned_to_user = None
    if todo.assigned_to_user_id:
        assigned_to_user = db.query(models.User).filter(
            models.User.id == todo.assigned_to_user_id,
            models.User.role == models.UserRole.USER.value
        ).first()
        if not assigned_to_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned user not found or is not a regular user"
            )
    
    db_todo = models.Todo(
        title=todo.title,
        description=todo.description,
        priority=todo.priority.value,
        status=todo.status.value if todo.status else models.TodoStatus.NEW.value,
        category=todo.category,
        order_index=next_index,
        user_id=user_id,
        assigned_to_user_id=todo.assigned_to_user_id
    )
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    
    assigned_to_username = None
    assigned_user_email = None
    creator = db.query(models.User).filter(models.User.id == user_id).first()
    creator_username = creator.username if creator else "Admin"
    
    if db_todo.assigned_to_user_id:
        assigned_user = db.query(models.User).filter(
            models.User.id == db_todo.assigned_to_user_id
        ).first()
        if assigned_user:
            assigned_to_username = assigned_user.username
            assigned_user_email = assigned_user.email
            
            # Only notify the assigned user if:
            # 1. They are not the creator (no self-notifications)
            # 2. They are not an admin (admins don't receive notifications)
            # Note: The creator (user_id) never receives notifications, only the assigned user does
            should_notify = (
                assigned_user.id != user_id and  # Not self-assignment
                assigned_user.role != models.UserRole.ADMIN.value  # Assigned user is not an admin
            )
            
            if should_notify:
                message = f"{creator_username} assigned you a todo: {db_todo.title}"
                await create_notification(
                    db,
                    assigned_user.id,  # Only send to assigned user, never to creator
                    db_todo.id,
                    message,
                    creator_username,
                    assigned_user_email,
                    db_todo.title
                )
    
    todo_dict = {
        "id": db_todo.id,
        "title": db_todo.title,
        "description": db_todo.description,
        "status": db_todo.status or models.TodoStatus.NEW.value,
        "priority": db_todo.priority,
        "category": db_todo.category,
        "order_index": db_todo.order_index,
        "created_at": db_todo.created_at,
        "updated_at": db_todo.updated_at,
        "user_id": db_todo.user_id,
        "assigned_to_user_id": db_todo.assigned_to_user_id,
        "assigned_to_username": assigned_to_username
    }
    return schemas.TodoResponse(**todo_dict)

def _validate_assigned_user(assigned_user_id: int, db: Session) -> None:
    assigned_user = db.query(models.User).filter(
        models.User.id == assigned_user_id,
        models.User.role == models.UserRole.USER.value
    ).first()
    if not assigned_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned user not found or is not a regular user"
        )


def _get_assigned_username(assigned_user_id: int | None, db: Session) -> str | None:
    if not assigned_user_id:
        return None
    assigned_user = db.query(models.User).filter(
        models.User.id == assigned_user_id
    ).first()
    return assigned_user.username if assigned_user else None


def _build_todo_response(todo_db: models.Todo, db: Session) -> schemas.TodoResponse:
    assigned_to_username = _get_assigned_username(todo_db.assigned_to_user_id, db)
    todo_dict = {
        "id": todo_db.id,
        "title": todo_db.title,
        "description": todo_db.description,
        "status": todo_db.status or models.TodoStatus.NEW.value,
        "priority": todo_db.priority,
        "category": todo_db.category,
        "order_index": todo_db.order_index,
        "created_at": todo_db.created_at,
        "updated_at": todo_db.updated_at,
        "user_id": todo_db.user_id,
        "assigned_to_user_id": todo_db.assigned_to_user_id,
        "assigned_to_username": assigned_to_username
    }
    return schemas.TodoResponse(**todo_dict)


def _can_access_todo(todo_db: models.Todo, user_id: int, db: Session) -> bool:
    """True if user is creator, assigned to the todo, or admin."""
    if todo_db.user_id == user_id or todo_db.assigned_to_user_id == user_id:
        return True
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user is not None and user.role == models.UserRole.ADMIN.value


@router.get("/{todo_id}", response_model=schemas.TodoResponse)
def get_todo(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Get a single todo by ID. User must be the creator or assigned to the todo."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view this todo")
    return _build_todo_response(todo_db, db)


@router.get("/{todo_id}/comments", response_model=schemas.CommentListResponse)
def get_todo_comments(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Get comments for a todo. User must be creator or assigned to the todo."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view this todo")
    comments = db.query(models.TodoComment).filter(models.TodoComment.todo_id == todo_id).order_by(models.TodoComment.created_at.asc()).all()
    result = []
    for c in comments:
        author = db.query(models.User).filter(models.User.id == c.user_id).first()
        username = author.username if author else f"User#{c.user_id}"
        user_photo = getattr(author, 'profile_pic', None) if author else None
        result.append(schemas.CommentResponse(
            id=c.id,
            todo_id=c.todo_id,
            user_id=c.user_id,
            username=username,
            user_photo=user_photo,
            content=c.content,
            created_at=c.created_at,
        ))
    return schemas.CommentListResponse(comments=result)


@router.post("/{todo_id}/comments", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_todo_comment(
    todo_id: int,
    user_id: int,
    body: schemas.CommentCreate,
    db: Session = Depends(database.get_db)
):
    """Add a comment to a todo. User must be creator or assigned to the todo."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to comment on this todo")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content is required")
    author = db.query(models.User).filter(models.User.id == user_id).first()
    if not author:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    comment = models.TodoComment(todo_id=todo_id, user_id=user_id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Notify the other party: admin comments -> notify assigned user; user comments -> notify todo creator
    author_is_admin = author.role == models.UserRole.ADMIN.value
    todo_title = todo_db.title or "Todo"
    author_username = author.username or "Someone"

    if author_is_admin:
        # Admin commented: notify the user assigned to this todo (if any and not self)
        if todo_db.assigned_to_user_id and todo_db.assigned_to_user_id != user_id:
            assigned_user = db.query(models.User).filter(models.User.id == todo_db.assigned_to_user_id).first()
            if assigned_user and assigned_user.role != models.UserRole.ADMIN.value:
                message = f"{author_username} commented on todo: {todo_title}"
                await create_notification(
                    db,
                    assigned_user.id,
                    todo_id,
                    message,
                    author_username,
                    assigned_user.email or "",
                    todo_title,
                )
    else:
        # User (non-admin) commented: notify the todo creator (admin/owner)
        if todo_db.user_id != user_id:
            creator = db.query(models.User).filter(models.User.id == todo_db.user_id).first()
            if creator:
                message = f"{author_username} commented on todo: {todo_title}"
                await create_notification(
                    db,
                    creator.id,
                    todo_id,
                    message,
                    author_username,
                    creator.email or "",
                    todo_title,
                )

    # Notify mentioned users
    for mentioned_id in body.mentioned_user_ids or []:
        if mentioned_id == user_id:
            continue
        mentioned_user = db.query(models.User).filter(models.User.id == mentioned_id).first()
        if not mentioned_user:
            continue
        message = f"{author_username} mentioned you in a comment on todo: {todo_title}"
        await create_notification(
            db,
            mentioned_user.id,
            todo_id,
            message,
            author_username,
            mentioned_user.email or "",
            todo_title,
        )

    return schemas.CommentResponse(
        id=comment.id,
        todo_id=comment.todo_id,
        user_id=comment.user_id,
        username=author.username,
        user_photo=getattr(author, 'profile_pic', None),
        content=comment.content,
        created_at=comment.created_at,
    )


@router.put("/{todo_id}/comments/{comment_id}", response_model=schemas.CommentResponse)
def update_todo_comment(
    todo_id: int,
    comment_id: int,
    user_id: int,
    body: schemas.CommentCreate,
    db: Session = Depends(database.get_db)
):
    """Update a comment. Only the comment author can update."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
    comment_db = db.query(models.TodoComment).filter(
        models.TodoComment.id == comment_id,
        models.TodoComment.todo_id == todo_id,
    ).first()
    if not comment_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment_db.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own comment")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content is required")
    comment_db.content = content
    db.commit()
    db.refresh(comment_db)
    author = db.query(models.User).filter(models.User.id == comment_db.user_id).first()
    return schemas.CommentResponse(
        id=comment_db.id,
        todo_id=comment_db.todo_id,
        user_id=comment_db.user_id,
        username=author.username if author else f"User#{comment_db.user_id}",
        user_photo=getattr(author, 'profile_pic', None) if author else None,
        content=comment_db.content,
        created_at=comment_db.created_at,
    )


@router.delete("/{todo_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_todo_comment(
    todo_id: int,
    comment_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Delete a comment. Only the comment author can delete."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
    comment_db = db.query(models.TodoComment).filter(
        models.TodoComment.id == comment_id,
        models.TodoComment.todo_id == todo_id,
    ).first()
    if not comment_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    if comment_db.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own comment")
    db.delete(comment_db)
    db.commit()
    return None


@router.put("/{todo_id}", response_model=schemas.TodoResponse)
async def update_todo(
    todo_id: int,
    todo: schemas.TodoUpdate,
    user_id: int,
    # Removed background_tasks
    db: Session = Depends(database.get_db)
):
    """Update a todo by ID"""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    
    # Allow update if user is the creator, assigned to the todo, or admin
    can_update = _can_access_todo(todo_db, user_id, db)
    if not can_update:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to update this todo")
    
    # Track which fields actually changed (for notification)
    changed_fields = []
    
    # Update fields if provided and track changes
    if todo.title:
        if todo_db.title != todo.title:
            changed_fields.append('title')
        todo_db.title = todo.title
    if todo.description is not None:
        if todo_db.description != todo.description:
            changed_fields.append('description')
        todo_db.description = todo.description
    if todo.priority:
        if todo_db.priority != todo.priority.value:
            changed_fields.append('priority')
        todo_db.priority = todo.priority.value
    if todo.category is not None:
        if todo_db.category != todo.category:
            changed_fields.append('category')
        todo_db.category = todo.category
    status_changed = False
    old_status = todo_db.status
    was_done = todo_db.status == models.TodoStatus.DONE.value
    if todo.status:
        if todo_db.status != todo.status.value:
            changed_fields.append('status')
            status_changed = True
        todo_db.status = todo.status.value
    
    # Get updater info early
    updater = db.query(models.User).filter(models.User.id == user_id).first()
    updater_username = updater.username if updater else "User"
    is_admin_updater = updater and updater.role == models.UserRole.ADMIN.value
    
    # Track if assignment changed
    assignment_changed = False
    old_assigned_user_id = todo_db.assigned_to_user_id
    original_assigned_user_id = todo_db.assigned_to_user_id
    
    # Handle assigned user update
    provided_fields = todo.model_dump(exclude_unset=True)
    if 'assigned_to_user_id' in provided_fields:
        new_assigned_user_id = todo.assigned_to_user_id
        
        if new_assigned_user_id is not None:
            _validate_assigned_user(new_assigned_user_id, db)
        
        # Check if assignment changed
        assignment_changed = old_assigned_user_id != new_assigned_user_id
        
        # Update logic
        todo_db.assigned_to_user_id = new_assigned_user_id
        
        # Notification Logic: Only send to assigned users, never to creator/updater
        # Admins never receive notifications, regardless of whether they're creator or assigned
        if assignment_changed:
            
            # Case 1: Unassigning (old user exists, new is None)
            if old_assigned_user_id and new_assigned_user_id is None:
                old_assigned_user = db.query(models.User).filter(
                    models.User.id == old_assigned_user_id
                ).first()
                # Only notify if: user exists, not creator, and not admin
                if old_assigned_user and old_assigned_user.id != user_id and old_assigned_user.role != models.UserRole.ADMIN.value:
                    message = f"{updater_username} unassigned you from todo: {todo_db.title}"
                    await create_notification(
                        db,
                        old_assigned_user.id,  # Only to old assigned user, never to creator
                        todo_db.id,
                        message,
                        updater_username,
                        old_assigned_user.email,
                        todo_db.title
                    )
            
            # Case 2: Reassigning (both old and new users exist, and they're different)
            elif old_assigned_user_id and new_assigned_user_id and old_assigned_user_id != new_assigned_user_id:
                # Notify old user they were unassigned
                old_assigned_user = db.query(models.User).filter(
                    models.User.id == old_assigned_user_id
                ).first()
                if old_assigned_user and old_assigned_user.id != user_id and old_assigned_user.role != models.UserRole.ADMIN.value:
                    message = f"{updater_username} unassigned you from todo: {todo_db.title}"
                    await create_notification(
                        db,
                        old_assigned_user.id,  # Only to old assigned user, never to creator
                        todo_db.id,
                        message,
                        updater_username,
                        old_assigned_user.email,
                        todo_db.title
                    )
                
                # Notify new user they were assigned
                new_assigned_user = db.query(models.User).filter(
                    models.User.id == new_assigned_user_id
                ).first()
                if new_assigned_user and new_assigned_user.id != user_id and new_assigned_user.role != models.UserRole.ADMIN.value:
                    message = f"{updater_username} assigned you a todo: {todo_db.title}"
                    await create_notification(
                        db,
                        new_assigned_user.id,  # Only to new assigned user, never to creator
                        todo_db.id,
                        message,
                        updater_username,
                        new_assigned_user.email,
                        todo_db.title
                    )
            
            # Case 3: Assigning to a new user (old was None, new exists)
            elif new_assigned_user_id:
                new_assigned_user = db.query(models.User).filter(
                    models.User.id == new_assigned_user_id
                ).first()
                # Only notify if: user exists, not creator, and not admin
                if new_assigned_user and new_assigned_user.id != user_id and new_assigned_user.role != models.UserRole.ADMIN.value:
                    message = f"{updater_username} assigned you a todo: {todo_db.title}"
                    await create_notification(
                        db,
                        new_assigned_user.id,  # Only to new assigned user, never to creator
                        todo_db.id,
                        message,
                        updater_username,
                        new_assigned_user.email,
                        todo_db.title
                    )
    
    final_assigned_user_id = todo_db.assigned_to_user_id
    
    if status_changed:
        creator = db.query(models.User).filter(models.User.id == todo_db.user_id).first()
        status_labels = {
            models.TodoStatus.NEW.value: "New",
            models.TodoStatus.IN_PROGRESS.value: "In Progress",
            models.TodoStatus.PAUSED.value: "Paused",
            models.TodoStatus.DONE.value: "Done"
        }
        new_status_label = status_labels.get(todo_db.status, todo_db.status)
        
        should_notify_admin = (
            not is_admin_updater and
            original_assigned_user_id and
            original_assigned_user_id == user_id and
            creator and
            creator.role == models.UserRole.ADMIN.value and
            creator.id != user_id
        )
        
        if should_notify_admin:
            message = f"{updater_username} changed the status of todo '{todo_db.title}' to '{new_status_label}'"
            try:
                await create_notification(
                    db,
                    creator.id,
                    todo_db.id,
                    message,
                    updater_username,
                    creator.email,
                    todo_db.title
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send status change notification to admin {creator.id}: {e}")
    
    # Only notify if there are actual field changes (not just assignment)
    has_other_updates = len(changed_fields) > 0
    
    if (is_admin_updater and 
        final_assigned_user_id and 
        not assignment_changed and 
        has_other_updates):
        
        assigned_user = db.query(models.User).filter(
            models.User.id == final_assigned_user_id
        ).first()
        
        if assigned_user and assigned_user.id != user_id and assigned_user.role != models.UserRole.ADMIN.value:
            field_names = {
                'title': 'title',
                'description': 'description',
                'priority': 'priority',
                'category': 'category',
                'status': 'status'
            }
            
            updated_field_names = [field_names.get(field, field) for field in changed_fields]
            
            if updated_field_names:
                if len(updated_field_names) == 1:
                    fields_str = updated_field_names[0]
                    message = f"{updater_username} updated the {fields_str} of todo: {todo_db.title}"
                else:
                    fields_str = ', '.join(updated_field_names[:-1]) + f' and {updated_field_names[-1]}'
                    message = f"{updater_username} updated the {fields_str} of todo: {todo_db.title}"
            else:
                message = f"{updater_username} updated the todo: {todo_db.title}"
            
            await create_notification(
                db,
                assigned_user.id,
                todo_db.id,
                message,
                updater_username,
                assigned_user.email,
                todo_db.title
            )
    
    db.commit()
    db.refresh(todo_db)
    return _build_todo_response(todo_db, db)

@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    
    if todo.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to delete this todo")

    db.query(models.Notification).filter(
        models.Notification.todo_id == todo_id
    ).delete()
    db.flush()
    
    deleter = db.query(models.User).filter(models.User.id == user_id).first()
    deleter_username = deleter.username if deleter else "Admin"
    
    todo_title = todo.title
    deleted_index = todo.order_index
    
    if todo.assigned_to_user_id:
        assigned_user = db.query(models.User).filter(
            models.User.id == todo.assigned_to_user_id
        ).first()
        if assigned_user and assigned_user.id != user_id and assigned_user.role != models.UserRole.ADMIN.value:
            message = f"{deleter_username} deleted the todo: {todo_title}"
            notification = models.Notification(
                user_id=assigned_user.id,
                todo_id=todo_id,
                message=message
            )
            db.add(notification)
            db.flush()  # Flush to get the notification ID
            db.refresh(notification)
            
            # Set todo_id to NULL before deleting the todo to avoid foreign key constraint
            notification.todo_id = None
            db.flush()
            
            # Now send via WebSocket and email
            notification_data = {
                "id": notification.id,
                "user_id": notification.user_id,
                "todo_id": None,
                "message": notification.message,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat() if notification.created_at else None
            }
            
            await notification_manager.send_notification(assigned_user.id, notification_data)
            
            if assigned_user.email:
                email_service.send_notification_email(
                    to_email=assigned_user.email,
                    todo_title=todo_title,
                    assigned_by=deleter_username
                )

    # Delete the todo (notification no longer references it)
    db.delete(todo)
    
    db.query(models.Todo).filter(
        models.Todo.user_id == user_id,
        models.Todo.order_index > deleted_index
    ).update({models.Todo.order_index: models.Todo.order_index - 1})
    
    db.commit()

    return {"message": "Todo deleted successfully"}