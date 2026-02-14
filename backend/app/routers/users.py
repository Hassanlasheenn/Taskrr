import base64
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from .. import database, models, schemas
from ..dependencies import get_current_user


router = APIRouter(tags=["users"])


def image_to_base64(file_content: bytes, content_type: str) -> str:
    """Convert image bytes to base64 data URL"""
    base64_data = base64.b64encode(file_content).decode('utf-8')
    return f"data:{content_type};base64,{base64_data}"


@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_data(user_id: int, db: Session = Depends(database.get_db)):
    user_db = db.query(models.User).filter(models.User.id == user_id).first()
    if user_db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": getattr(user_db, 'profile_pic', None),
        "role": getattr(user_db, 'role', 'user')
    }
    return schemas.UserResponse(**user_dict)


@router.put("/{user_id}", response_model=schemas.UserResponse)
async def update_user_data(
    user_id: int,
    username: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    delete_photo: Optional[str] = Form(None),
    db: Session = Depends(database.get_db)
):
    user_db = db.query(models.User).filter(models.User.id == user_id).first()
    if user_db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if username is not None:
        user_db.username = username
    if email is not None:
        user_db.email = email
    
    if delete_photo and delete_photo.lower() == 'true':
        user_db.profile_pic = None
    
    elif photo:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        content = await photo.read()
        
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size must be less than 5MB"
            )
        
        user_db.profile_pic = image_to_base64(content, photo.content_type)
    
    db.commit()
    db.refresh(user_db)
    
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": user_db.profile_pic,
        "role": getattr(user_db, 'role', 'user')
    }
    return schemas.UserResponse(**user_dict)


@router.get("/role/user", response_model=List[schemas.UserListResponse])
def get_users_with_role_user(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    users = db.query(models.User).filter(
        models.User.role == models.UserRole.USER.value
    ).all()
    
    return [
        schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=getattr(user, 'profile_pic', None),
            role=user.role
        )
        for user in users
    ]