import jwt
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from .. import database, models, schemas
from ..config import SECRET_KEY, ALGORITHM
from ..dependencies import get_current_user
from ..services.notification_service import notification_manager
from ..services.email_service import EmailService

router = APIRouter(prefix="/notifications", tags=["notifications"])

email_service = EmailService()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int, token: str = Query(...)):
    # Accept the WebSocket connection first (required before any operations)
    await websocket.accept()
    
    # Validate token and get authenticated user ID
    authenticated_user_id = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")  # Token contains email in 'sub', not user ID
        if email:
            # Look up user by email to get user ID
            db = next(database.get_db())
            try:
                user = db.query(models.User).filter(models.User.email == email).first()
                if user:
                    authenticated_user_id = user.id
            finally:
                db.close()
    except jwt.ExpiredSignatureError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token expired")
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error validating WebSocket token: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return
    
    # Verify the authenticated user matches the requested user_id
    if authenticated_user_id is None or authenticated_user_id != user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User ID mismatch")
        return

    # Connect to notification manager (this doesn't accept again, just registers)
    await notification_manager.connect(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        notification_manager.disconnect(user_id, websocket)
    except Exception as e:
        notification_manager.disconnect(user_id, websocket)


@router.get("", response_model=schemas.NotificationListResponse)
def get_notifications(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id
    notifications = db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).order_by(models.Notification.created_at.desc()).offset(skip).limit(limit).all()
    
    total = db.query(models.Notification).filter(
        models.Notification.user_id == user_id
    ).count()
    
    unread_count = db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False
    ).count()
    
    notification_responses = [
        schemas.NotificationResponse(
            id=n.id,
            user_id=n.user_id,
            todo_id=n.todo_id,
            message=n.message,
            is_read=n.is_read,
            created_at=n.created_at
        )
        for n in notifications
    ]
    
    return schemas.NotificationListResponse(
        notifications=notification_responses,
        total=total,
        unread_count=unread_count
    )


@router.put("/{notification_id}/read", response_model=schemas.NotificationResponse)
def mark_as_read(
    notification_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == user_id
    ).first()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    
    return schemas.NotificationResponse(
        id=notification.id,
        user_id=notification.user_id,
        todo_id=notification.todo_id,
        message=notification.message,
        is_read=notification.is_read,
        created_at=notification.created_at
    )


@router.put("/read-all", status_code=status.HTTP_200_OK)
def mark_all_as_read(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id
    db.query(models.Notification).filter(
        models.Notification.user_id == user_id,
        models.Notification.is_read == False
    ).update({models.Notification.is_read: True})
    db.commit()
    
    return {"message": "All notifications marked as read"}


@router.delete("/{notification_id}", status_code=status.HTTP_200_OK)
def delete_notification(
    notification_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    user_id = current_user.id
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == user_id
    ).first()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    db.delete(notification)
    db.commit()
    
    return {"message": "Notification deleted successfully"}


async def create_notification(
    db: Session,
    user_id: int,
    todo_id: int,
    message: str,
    assigned_by_username: str,
    assigned_to_email: str,
    todo_title: str
):
    try:
        notification = models.Notification(
            user_id=user_id,
            todo_id=todo_id,
            message=message
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        
        notification_data = {
            "id": notification.id,
            "user_id": notification.user_id,
            "todo_id": notification.todo_id,
            "message": notification.message,
            "is_read": notification.is_read,
            "created_at": notification.created_at.isoformat() if notification.created_at else None
        }
        
        # Send via WebSocket if user is connected
        await notification_manager.send_notification(user_id, notification_data)
        
        # Send email if email is provided
        if assigned_to_email:
            email_service.send_notification_email(
                to_email=assigned_to_email,
                todo_title=todo_title,
                assigned_by=assigned_by_username
            )
    except Exception as e:
        # Log error but don't fail the todo operation
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error creating notification for user {user_id}: {e}")
        db.rollback()
