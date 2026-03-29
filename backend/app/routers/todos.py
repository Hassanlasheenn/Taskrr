from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from ..dependencies import get_current_user
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
from datetime import datetime
from .. import database, models, schemas
from ..routers.notifications import create_notification
from ..services.notification_service import notification_manager
from ..services.email_service import EmailService
from ..cache import (
    cache_get,
    cache_set,
    invalidate_todo_list_for_user,
    invalidate_todo_detail,
    invalidate_todo_comments,
    invalidate_admin_users_with_todos,
    PREFIX_TODOS_LIST,
    PREFIX_TODO_DETAIL,
    PREFIX_TODO_COMMENTS,
)
from ..config import CACHE_TTL_TODO_LIST, CACHE_TTL_TODO_DETAIL, CACHE_TTL_TODO_COMMENTS
from ..utils import get_photo_url, get_full_url
from ..services.storage_service import S3StorageService
from ..services.rate_limiter import RateLimiter

router = APIRouter(prefix="/todos", tags=["todos"])

email_service = EmailService()
storage_service = S3StorageService()
todo_limiter = RateLimiter(requests_limit=10, window_seconds=60)


def _ensure_time_estimate_column(db: Session):
    from sqlalchemy import text
    from .. import database as _db
    db_url = str(_db.engine.url).lower()
    try:
        if "postgresql" in db_url or "postgres" in db_url:
            result = db.execute(text(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME = 'todos' AND COLUMN_NAME = 'time_estimate'"
            ))
            if result.scalar() == 0:
                db.execute(text("ALTER TABLE todos ADD COLUMN time_estimate VARCHAR(50)"))
                db.commit()
        elif "sqlite" in db_url:
            result = db.execute(text("PRAGMA table_info(todos)"))
            columns = [row[1] for row in result]
            if "time_estimate" not in columns:
                db.execute(text("ALTER TABLE todos ADD COLUMN time_estimate VARCHAR(50)"))
                db.commit()
    except Exception:
        db.rollback()


@router.get("", response_model=schemas.TodoListResponse)
def get_todos(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    sort_order: str = "desc",
    title: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    created_from: Optional[str] = None,
    created_to: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    _ensure_time_estimate_column(db)
    sort_order = sort_order.lower() if sort_order.lower() in ("asc", "desc") else "desc"
    has_filters = any([title, priority, status, created_from, created_to])
    cache_key = f"{PREFIX_TODOS_LIST}{user_id}:{skip}:{limit}:{sort_order}:{title or ''}:{priority or ''}:{status or ''}:{created_from or ''}:{created_to or ''}"
    if not has_filters:
        cached = cache_get(cache_key)
        if cached is not None:
            return schemas.TodoListResponse(
                todos=[schemas.TodoResponse(**t) for t in cached["todos"]],
                total=cached["total"],
            )
    # Admins see their own assigned todos PLUS todos with no assignee (unassigned column).
    # Regular users only see todos assigned to them.
    if current_user.role == "admin":
        todo_filter = and_(
            or_(
                models.Todo.assigned_to_user_id == user_id,
                models.Todo.assigned_to_user_id == None
            ),
            models.Todo.is_deleted == False
        )
    else:
        todo_filter = and_(
            models.Todo.assigned_to_user_id == user_id,
            models.Todo.is_deleted == False
        )
    if title:
        todo_filter = and_(todo_filter, models.Todo.title.ilike(f"%{title}%"))
    if priority:
        todo_filter = and_(todo_filter, models.Todo.priority == priority)
    if status:
        todo_filter = and_(todo_filter, models.Todo.status == status)
    if created_from:
        try:
            from_dt = datetime.strptime(created_from, "%Y-%m-%d")
            todo_filter = and_(todo_filter, models.Todo.created_at >= from_dt)
        except ValueError:
            pass
    if created_to:
        try:
            to_dt = datetime.strptime(created_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            todo_filter = and_(todo_filter, models.Todo.created_at <= to_dt)
        except ValueError:
            pass
    order_expr = models.Todo.created_at.desc() if sort_order == "desc" else models.Todo.created_at.asc()
    todos = db.query(models.Todo).filter(todo_filter).distinct().order_by(order_expr).offset(skip).limit(limit).all()
    total = db.query(models.Todo).filter(todo_filter).count()
    todo_responses = []
    for todo in todos:
        todo_responses.append(_build_todo_response(todo, db))
    if not has_filters:
        cache_set(cache_key, {"todos": [t.model_dump() for t in todo_responses], "total": total}, CACHE_TTL_TODO_LIST)
    return schemas.TodoListResponse(todos=todo_responses, total=total)


@router.post("", response_model=schemas.TodoResponse, status_code=status.HTTP_201_CREATED)
async def create_todo(
    todo: schemas.TodoCreate,
    user_id: int,
    db: Session = Depends(database.get_db),
    _ = Depends(todo_limiter)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    max_index = db.query(func.max(models.Todo.order_index)).filter(
        models.Todo.user_id == user_id
    ).scalar()
    next_index = (max_index or 0) + 1

    if todo.assigned_to_user_id:
        assigned_to_user = db.query(models.User).filter(
            models.User.id == todo.assigned_to_user_id
        ).first()
        if not assigned_to_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned user not found")
        if user.role != models.UserRole.ADMIN.value and assigned_to_user.role != models.UserRole.USER.value:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Non-admin users can only assign todos to regular users")

    db_todo = models.Todo(
        title=todo.title,
        description=todo.description,
        priority=todo.priority.value,
        status=todo.status.value if todo.status else models.TodoStatus.NEW.value,
        category=todo.category,
        time_estimate=todo.time_estimate,
        time_logged=todo.time_logged,
        due_date=todo.due_date,
        order_index=next_index,
        user_id=user_id,
        assigned_to_user_id=todo.assigned_to_user_id
    )
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)

    _add_field_history(db, db_todo.id, user_id, "created", None, "Task Created")

    assigned_to_username = None
    creator = db.query(models.User).filter(models.User.id == user_id).first()
    creator_username = creator.username if creator else "Admin"

    if db_todo.assigned_to_user_id:
        assigned_user = db.query(models.User).filter(
            models.User.id == db_todo.assigned_to_user_id
        ).first()
        if assigned_user:
            assigned_to_username = assigned_user.username
            if assigned_user.id != user_id:
                message = f"{creator_username} assigned you a todo: {db_todo.title}"
                await create_notification(
                    db,
                    assigned_user.id,
                    db_todo.id,
                    message,
                    creator_username,
                    assigned_user.email,
                    db_todo.title
                )

    invalidate_todo_list_for_user(user_id)
    if db_todo.assigned_to_user_id:
        invalidate_todo_list_for_user(db_todo.assigned_to_user_id)
    invalidate_admin_users_with_todos()

    return _build_todo_response(db_todo, db)


def _validate_assigned_user(assigned_to_user_id: int | None, db: Session, user_role: str) -> None:
    if not assigned_to_user_id:
        return
    assigned_user = db.query(models.User).filter(
        models.User.id == assigned_to_user_id
    ).first()
    if not assigned_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned user not found"
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
        "due_date": todo_db.due_date,
        "reminder_sent_at": todo_db.reminder_sent_at,
        "order_index": todo_db.order_index,
        "created_at": todo_db.created_at,
        "updated_at": todo_db.updated_at,
        "user_id": todo_db.user_id,
        "assigned_to_user_id": todo_db.assigned_to_user_id,
        "assigned_to_username": assigned_to_username,
        "time_estimate": todo_db.time_estimate,
        "time_logged": todo_db.time_logged
    }
    return schemas.TodoResponse(**todo_dict)


def _can_access_todo(todo_db: models.Todo, user_id: int, db: Session) -> bool:
    """True if user is creator, assigned to the todo, or admin."""
    if todo_db.user_id == user_id or todo_db.assigned_to_user_id == user_id:
        return True
    _ensure_time_estimate_column(db)
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user is not None and user.role == models.UserRole.ADMIN.value


def _add_comment_history(
    db: Session,
    todo_id: int,
    comment_id: int | None,
    user_id: int,
    action: str,
    content_before: str | None = None,
    content_after: str | None = None,
) -> None:
    row = models.TodoCommentHistory(
        todo_id=todo_id,
        comment_id=comment_id,
        user_id=user_id,
        action=action,
        content_before=content_before,
        content_after=content_after,
    )
    db.add(row)
    db.commit()


def _add_field_history(
    db: Session,
    todo_id: int,
    user_id: int,
    field: str,
    old_value: str | None,
    new_value: str | None,
) -> None:
    row = models.TodoFieldHistory(
        todo_id=todo_id,
        user_id=user_id,
        field=field,
        old_value=old_value,
        new_value=new_value,
    )
    db.add(row)
    db.commit()


@router.get("/{todo_id}", response_model=schemas.TodoResponse)
def get_todo(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Get a single todo by ID. User must be the creator or assigned to the todo."""
    cache_key = f"{PREFIX_TODO_DETAIL}{todo_id}"
    cached = cache_get(cache_key)
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view this todo")
    if cached is not None:
        return schemas.TodoResponse(**cached)
    response = _build_todo_response(todo_db, db)
    cache_set(cache_key, response.model_dump(mode="json"), CACHE_TTL_TODO_DETAIL)
    return response


@router.get("/{todo_id}/comments", response_model=schemas.CommentListResponse)
def get_todo_comments(
    request: Request,
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db)
):
    """Get comments for a todo. User must be creator or assigned to the todo."""
    cache_key = f"{PREFIX_TODO_COMMENTS}{todo_id}"
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view this todo")
    
    cached = cache_get(cache_key)
    if cached is not None:
        comments = []
        for c in cached:
            # Process the raw photo path from cache into a full URL
            c['user_photo'] = get_photo_url(request, c.get('user_photo'))
            comments.append(schemas.CommentResponse(**c))
        return schemas.CommentListResponse(comments=comments)
        
    # Join with User table to get author info efficiently
    comments_with_authors = (
        db.query(models.TodoComment, models.User)
        .join(models.User, models.TodoComment.user_id == models.User.id)
        .filter(models.TodoComment.todo_id == todo_id)
        .order_by(models.TodoComment.created_at.asc())
        .all()
    )
    
    result = []
    cache_data = []
    
    for c, author in comments_with_authors:
        # Create the response object with full URL
        response_item = schemas.CommentResponse(
            id=c.id,
            todo_id=c.todo_id,
            user_id=c.user_id,
            username=author.username,
            user_photo=get_photo_url(request, author.profile_pic),
            content=c.content,
            attachment_url=c.attachment_url,
            attachment_name=c.attachment_name,
            created_at=c.created_at,
        )
        result.append(response_item)
        
        # Prepare cache data with RAW photo path
        cache_item = response_item.model_dump(mode="json")
        cache_item['user_photo'] = author.profile_pic
        cache_data.append(cache_item)
        
    cache_set(cache_key, cache_data, CACHE_TTL_TODO_COMMENTS)
    return schemas.CommentListResponse(comments=result)


@router.post("/{todo_id}/comments", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_todo_comment(
    request: Request,
    todo_id: int,
    user_id: int,
    content: str = Form(...),
    mentioned_user_ids: Optional[str] = Form(None), # JSON string
    attachment: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db)
):
    """Add a comment to a todo with an optional attachment."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to comment on this todo")
    
    content = (content or "").strip()
    if not content and not attachment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content or attachment is required")
    
    author = db.query(models.User).filter(models.User.id == user_id).first()
    if not author:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Handle attachment
    attachment_url = None
    attachment_name = None
    if attachment:
        file_content = await attachment.read()
        attachment_url = storage_service.upload_file(file_content, attachment.filename or "file")
        attachment_name = attachment.filename

    comment = models.TodoComment(
        todo_id=todo_id, 
        user_id=user_id, 
        content=content,
        attachment_url=attachment_url,
        attachment_name=attachment_name
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _add_comment_history(db, todo_id, comment.id, user_id, models.TodoCommentHistoryAction.CREATED.value, content_before=None, content_after=content)

    # Handle mentions
    author_username = author.username or "Someone"
    todo_title = todo_db.title or "Todo"
    
    if mentioned_user_ids:
        try:
            import json
            ids = json.loads(mentioned_user_ids)
            for m_id in ids:
                if m_id == user_id: continue
                mentioned_user = db.query(models.User).filter(models.User.id == m_id).first()
                if mentioned_user:
                    message = f"{author_username} mentioned you in a comment on todo: {todo_title}"
                    await create_notification(db, mentioned_user.id, todo_id, message, author_username, mentioned_user.email or "", todo_title)
        except:
            pass

    # Notify the other party: admin comments -> notify assigned user; user comments -> notify todo creator
    author_is_admin = author.role == models.UserRole.ADMIN.value

    if author_is_admin:
        # Admin commented: notify the user assigned to this todo (if any and not self)
        if todo_db.assigned_to_user_id and todo_db.assigned_to_user_id != user_id:
            assigned_user = db.query(models.User).filter(models.User.id == todo_db.assigned_to_user_id).first()
            if assigned_user:
                message = f"{author_username} commented on todo: {todo_title}"
                await create_notification(db, assigned_user.id, todo_id, message, author_username, assigned_user.email or "", todo_title)
    else:
        # User (non-admin) commented: notify the todo creator (admin/owner)
        if todo_db.user_id != user_id:
            creator = db.query(models.User).filter(models.User.id == todo_db.user_id).first()
            if creator:
                message = f"{author_username} commented on todo: {todo_title}"
                await create_notification(db, creator.id, todo_id, message, author_username, creator.email or "", todo_title)

    invalidate_todo_comments(todo_id)
    return schemas.CommentResponse(
        id=comment.id,
        todo_id=comment.todo_id,
        user_id=comment.user_id,
        username=author.username,
        user_photo=get_photo_url(request, author.profile_pic),
        content=comment.content,
        attachment_url=comment.attachment_url,
        attachment_name=comment.attachment_name,
        created_at=comment.created_at,
    )


@router.put("/{todo_id}/comments/{comment_id}", response_model=schemas.CommentResponse)
async def update_todo_comment(
    request: Request,
    todo_id: int,
    comment_id: int,
    user_id: int,
    content: str = Form(...),
    delete_attachment: bool = False,
    attachment: Optional[UploadFile] = File(None),
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
    
    content = (content or "").strip()
    
    # Handle attachment replacement or deletion
    if attachment:
        # If new attachment, delete old one first
        if comment_db.attachment_url:
            storage_service.delete_file(comment_db.attachment_url)
        
        file_content = await attachment.read()
        comment_db.attachment_url = storage_service.upload_file(file_content, attachment.filename or "file")
        comment_db.attachment_name = attachment.filename
    elif delete_attachment:
        if comment_db.attachment_url:
            storage_service.delete_file(comment_db.attachment_url)
        comment_db.attachment_url = None
        comment_db.attachment_name = None

    if not content and not comment_db.attachment_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment content or attachment is required")
    
    old_content = comment_db.content
    comment_db.content = content

    db.commit()
    db.refresh(comment_db)
    _add_comment_history(db, todo_id, comment_db.id, user_id, models.TodoCommentHistoryAction.UPDATED.value, content_before=old_content, content_after=content)
    invalidate_todo_comments(todo_id)
    author = db.query(models.User).filter(models.User.id == comment_db.user_id).first()
    return schemas.CommentResponse(
        id=comment_db.id,
        todo_id=comment_db.todo_id,
        user_id=comment_db.user_id,
        username=author.username if author else f"User#{comment_db.user_id}",
        user_photo=get_photo_url(request, author.profile_pic) if author else None,
        content=comment_db.content,
        attachment_url=comment_db.attachment_url,
        attachment_name=comment_db.attachment_name,
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
    
    # Delete attachment if exists
    if comment_db.attachment_url:
        storage_service.delete_file(comment_db.attachment_url)
        
    comment_id_val = comment_db.id
    content_before = comment_db.content
    db.delete(comment_db)
    db.commit()
    _add_comment_history(db, todo_id, comment_id_val, user_id, models.TodoCommentHistoryAction.DELETED.value, content_before=content_before, content_after=None)
    invalidate_todo_comments(todo_id)
    return None


@router.get("/{todo_id}/comment-history", response_model=schemas.CommentHistoryListResponse)
def get_comment_history(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db),
):
    """Get comment activity history for a todo (add, edit, delete)."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
    rows = (
        db.query(models.TodoCommentHistory, models.User.username)
        .join(models.User, models.TodoCommentHistory.user_id == models.User.id)
        .filter(models.TodoCommentHistory.todo_id == todo_id)
        .order_by(models.TodoCommentHistory.created_at.desc())
        .all()
    )
    history = [
        schemas.CommentHistoryResponse(
            id=h.id,
            todo_id=h.todo_id,
            comment_id=h.comment_id,
            user_id=h.user_id,
            username=username or f"User#{h.user_id}",
            action=h.action,
            content_before=h.content_before,
            content_after=h.content_after,
            created_at=h.created_at,
        )
        for h, username in rows
    ]
    return schemas.CommentHistoryListResponse(history=history)


@router.get("/{todo_id}/history", response_model=schemas.TodoHistoryListResponse)
def get_todo_history(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db),
):
    """Get unified history for a todo (comments + status/priority/assigned changes)."""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    if not _can_access_todo(todo_db, user_id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    entries = []
    # Comment history
    comment_rows = (
        db.query(models.TodoCommentHistory, models.User.username)
        .join(models.User, models.TodoCommentHistory.user_id == models.User.id)
        .filter(models.TodoCommentHistory.todo_id == todo_id)
        .all()
    )
    for h, username in comment_rows:
        entries.append({
            "kind": "comment",
            "id": h.id,
            "todo_id": h.todo_id,
            "comment_id": h.comment_id,
            "user_id": h.user_id,
            "username": username or f"User#{h.user_id}",
            "action": h.action,
            "content_before": h.content_before,
            "content_after": h.content_after,
            "created_at": h.created_at.strftime('%Y-%m-%dT%H:%M:%S') if h.created_at else None,
        })
    # Field history
    field_rows = (
        db.query(models.TodoFieldHistory, models.User.username)
        .join(models.User, models.TodoFieldHistory.user_id == models.User.id)
        .filter(models.TodoFieldHistory.todo_id == todo_id)
        .all()
    )
    
    # Mapping for user-friendly field labels
    field_labels = {
        "title": "Title",
        "description": "Description",
        "status": "Status",
        "priority": "Priority",
        "category": "Category",
        "due_date": "Due Date",
        "assigned_to_user_id": "Assignee",
        "created": "Event"
    }

    for h, username in field_rows:
        entries.append({
            "kind": "field",
            "id": h.id,
            "todo_id": h.todo_id,
            "user_id": h.user_id,
            "username": username or f"User#{h.user_id}",
            "field": field_labels.get(h.field, h.field.replace('_', ' ').title()),
            "old_value": h.old_value,
            "new_value": h.new_value,
            "created_at": h.created_at.strftime('%Y-%m-%dT%H:%M:%S') if h.created_at else None,
        })
    # Sort by created_at desc (newest first)
    entries.sort(key=lambda e: e["created_at"] or "", reverse=True)
    # Build response with discriminated type
    history = []
    for e in entries:
        if e["kind"] == "comment":
            history.append(schemas.TodoHistoryEntryComment(
                type="comment",
                id=e["id"],
                todo_id=e["todo_id"],
                comment_id=e.get("comment_id"),
                user_id=e["user_id"],
                username=e["username"],
                action=e["action"],
                content_before=e.get("content_before"),
                content_after=e.get("content_after"),
                created_at=e.get("created_at"),
            ))
        else:
            history.append(schemas.TodoHistoryEntryField(
                type="field",
                id=e["id"],
                todo_id=e["todo_id"],
                user_id=e["user_id"],
                username=e["username"],
                field=e["field"],
                old_value=e.get("old_value"),
                new_value=e.get("new_value"),
                created_at=e.get("created_at"),
            ))
    return schemas.TodoHistoryListResponse(history=history)


@router.put("/{todo_id}", response_model=schemas.TodoResponse)
async def update_todo(
    todo_id: int,
    todo: schemas.TodoUpdate,
    user_id: int,
    # Removed background_tasks
    db: Session = Depends(database.get_db),
    _ = Depends(todo_limiter)
):
    _ensure_time_estimate_column(db)
    """Update a todo by ID"""
    todo_db = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not todo_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    
    # Allow update if user is the creator, assigned to the todo, or admin
    can_update = _can_access_todo(todo_db, user_id, db)
    if not can_update:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to update this todo")
    
    # Get updater info early
    updater = db.query(models.User).filter(models.User.id == user_id).first()
    updater_username = updater.username if updater else "User"
    is_admin_updater = updater and updater.role == models.UserRole.ADMIN.value

    # Snapshot old values for field history (before any updates)
    old_title = todo_db.title
    old_description = todo_db.description
    old_category = todo_db.category
    old_priority = todo_db.priority
    old_status = todo_db.status
    old_assigned_user_id = todo_db.assigned_to_user_id
    old_due_date = todo_db.due_date
    old_time_estimate = todo_db.time_estimate
    old_time_logged = todo_db.time_logged

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
            # Check if user is admin
            is_admin = updater and updater.role == models.UserRole.ADMIN.value
            if not is_admin:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only administrators can change task priority"
                )
            changed_fields.append('priority')
            todo_db.priority = todo.priority.value
    if todo.category is not None:
        if todo_db.category != todo.category:
            changed_fields.append('category')
        todo_db.category = todo.category

    provided_fields = todo.model_dump(exclude_unset=True)
    if 'time_estimate' in provided_fields:
        if todo_db.time_estimate != todo.time_estimate:
            changed_fields.append('time_estimate')
        todo_db.time_estimate = todo.time_estimate
    if 'time_logged' in provided_fields:
        if todo_db.time_logged != todo.time_logged:
            changed_fields.append('time_logged')
        todo_db.time_logged = todo.time_logged

    # Handle due_date update
    provided_fields = todo.model_dump(exclude_unset=True)
    if 'due_date' in provided_fields:
        if todo_db.due_date != todo.due_date:
            changed_fields.append('due_date')
        todo_db.due_date = todo.due_date

    status_changed = False
    old_status = todo_db.status
    was_done = todo_db.status == models.TodoStatus.DONE.value
    if todo.status:
        if todo_db.status != todo.status.value:
            changed_fields.append('status')
            status_changed = True
        todo_db.status = todo.status.value
    
    # Track if assignment changed
    assignment_changed = False
    original_assigned_user_id = old_assigned_user_id
    
    # Handle assigned user update
    provided_fields = todo.model_dump(exclude_unset=True)
    if 'assigned_to_user_id' in provided_fields:
        new_assigned_user_id = todo.assigned_to_user_id
        
        if new_assigned_user_id is not None:
            _validate_assigned_user(new_assigned_user_id, db, updater.role if updater else models.UserRole.USER.value)
        
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
                # Only notify if: user exists and not creator
                if old_assigned_user and old_assigned_user.id != user_id:
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
                if old_assigned_user and old_assigned_user.id != user_id:
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
                if new_assigned_user and new_assigned_user.id != user_id:
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
                if new_assigned_user and new_assigned_user.id != user_id:
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
    
    has_other_updates = len(changed_fields) > 0
    
    if (is_admin_updater and 
        final_assigned_user_id and 
        not assignment_changed and 
        has_other_updates):
        
        assigned_user = db.query(models.User).filter(
            models.User.id == final_assigned_user_id
        ).first()
        
        if assigned_user and assigned_user.id != user_id:
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

    # Log field history for status, priority, assigned_to_user_id
    status_labels = {
        models.TodoStatus.NEW.value: "New",
        models.TodoStatus.IN_PROGRESS.value: "In Progress",
        models.TodoStatus.PAUSED.value: "Paused",
        models.TodoStatus.DONE.value: "Done",
    }
    if old_status != todo_db.status:
        _add_field_history(
            db, todo_id, user_id, "status",
            status_labels.get(old_status, old_status),
            status_labels.get(todo_db.status, todo_db.status),
        )
    if old_title != todo_db.title:
        _add_field_history(db, todo_id, user_id, "title", old_title, todo_db.title)
    if old_description != todo_db.description:
        _add_field_history(db, todo_id, user_id, "description", old_description, todo_db.description)
    if old_category != todo_db.category:
        _add_field_history(db, todo_id, user_id, "category", old_category, todo_db.category)
    if old_priority != todo_db.priority:
        _add_field_history(db, todo_id, user_id, "priority", old_priority, todo_db.priority)
    if old_time_estimate != todo_db.time_estimate:
        _add_field_history(db, todo_id, user_id, "time_estimate", old_time_estimate, todo_db.time_estimate)
    if old_time_logged != todo_db.time_logged:
        _add_field_history(db, todo_id, user_id, "time_logged", old_time_logged, todo_db.time_logged)
    if old_due_date != todo_db.due_date:
        old_due_str = old_due_date.strftime('%Y-%m-%d') if old_due_date else "None"
        new_due_str = todo_db.due_date.strftime('%Y-%m-%d') if todo_db.due_date else "None"
        _add_field_history(db, todo_id, user_id, "due_date", old_due_str, new_due_str)
    if old_assigned_user_id != todo_db.assigned_to_user_id:
        old_assignee = db.query(models.User).filter(models.User.id == old_assigned_user_id).first() if old_assigned_user_id else None
        new_assignee = db.query(models.User).filter(models.User.id == todo_db.assigned_to_user_id).first() if todo_db.assigned_to_user_id else None
        old_val = (old_assignee.username if old_assignee else "Unassigned") if old_assigned_user_id else "Unassigned"
        new_val = (new_assignee.username if new_assignee else "Unassigned") if todo_db.assigned_to_user_id else "Unassigned"
        _add_field_history(db, todo_id, user_id, "assigned_to_user_id", old_val, new_val)

    invalidate_todo_detail(todo_id)
    invalidate_todo_list_for_user(todo_db.user_id)
    if todo_db.assigned_to_user_id:
        invalidate_todo_list_for_user(todo_db.assigned_to_user_id)
    if original_assigned_user_id and original_assigned_user_id != todo_db.assigned_to_user_id:
        invalidate_todo_list_for_user(original_assigned_user_id)
    invalidate_admin_users_with_todos()



    return _build_todo_response(todo_db, db)

@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: int,
    user_id: int,
    db: Session = Depends(database.get_db),
    _ = Depends(todo_limiter)
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
    
    if todo.assigned_to_user_id:
        assigned_user = db.query(models.User).filter(
            models.User.id == todo.assigned_to_user_id
        ).first()
        if assigned_user and assigned_user.id != user_id:
            message = f"{deleter_username} deleted the todo: {todo_title}"
            notification = models.Notification(
                user_id=assigned_user.id,
                todo_id=todo_id,
                message=message
            )
            db.add(notification)
            db.flush()
            db.refresh(notification)

            notification_data = {
                "id": notification.id,
                "user_id": notification.user_id,
                "todo_id": notification.todo_id,
                "message": notification.message,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat() if notification.created_at else None
            }
            
            await notification_manager.send_notification(assigned_user.id, notification_data)
            
            if assigned_user.email:
                import asyncio
                asyncio.create_task(
                    asyncio.to_thread(
                        email_service.send_notification_email,
                        assigned_user.email,
                        todo_title,
                        deleter_username
                    )
                )

    db.delete(todo)
    db.commit()
    invalidate_todo_detail(todo_id)
    invalidate_todo_list_for_user(todo.user_id)
    if todo.assigned_to_user_id:
        invalidate_todo_list_for_user(todo.assigned_to_user_id)
    invalidate_admin_users_with_todos()


@router.post("/upload-image")
async def upload_todo_image(
    user_id: int,
    request: Request,
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image files are allowed")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be under 10MB")

    url = storage_service.upload_file(
        content,
        file.filename or "pasted-image.png",
        folder="todo_images",
        content_type=file.content_type,
        s3_only=True  # Never fall back to local — local URLs break on redeployment
    )
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image storage (S3) is not configured or unavailable"
        )

    return {"url": url}