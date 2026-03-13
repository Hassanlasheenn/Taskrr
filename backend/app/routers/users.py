import base64
import io
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from .. import database, models, schemas
from ..dependencies import get_current_user
from ..cache import (
    cache_get,
    cache_set,
    invalidate_user_list_caches,
    invalidate_user_profile,
    PREFIX_USERS_MENTIONABLE,
    PREFIX_USERS_ROLE_USER,
    PREFIX_USER_PROFILE,
)
from ..config import CACHE_TTL_USER_LISTS, CACHE_TTL_USER_PROFILE


router = APIRouter(tags=["users"])


def image_to_base64(file_content: bytes, content_type: str) -> str:
    """
    Optimizes the image for storage and transmission:
    1. Resizes to max 150x150 while keeping aspect ratio.
    2. Converts to JPEG with 80% quality.
    3. Returns as a small base64 string (~5-10KB).
    """
    try:
        # Load image into Pillow
        img = Image.open(io.BytesIO(file_content))
        
        # Convert to RGB (required for JPEG and removes alpha channel transparency overhead)
        if img.mode != "RGB":
            img = img.convert("RGB")
        
        # Resize to thumbnail (Max 150px)
        img.thumbnail((150, 150), Image.Resampling.LANCZOS)
        
        # Save to memory buffer with compression
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=80, optimize=True)
        optimized_bytes = buffer.getvalue()
        
        # Encode tiny bytes to base64
        base64_str = base64.b64encode(optimized_bytes).decode('utf-8')
        return f"data:image/jpeg;base64,{base64_str}"
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Image optimization failed: {e}")
        # Fallback to original encoding if processing fails
        base64_data = base64.b64encode(file_content).decode('utf-8')
        return f"data:{content_type};base64,{base64_data}"


@router.get("/mentionable", response_model=List[schemas.UserListResponse])
def get_mentionable_users(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Return all users except the current user, for @mentions (includes admins)."""
    cache_key = f"{PREFIX_USERS_MENTIONABLE}{current_user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return [schemas.UserListResponse(**item) for item in cached]
    users = db.query(models.User).filter(models.User.id != current_user.id).all()
    result = [
        schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=getattr(user, 'profile_pic', None),
            role=getattr(user, 'role', 'user')
        )
        for user in users
    ]
    cache_set(cache_key, [r.model_dump(mode="json") for r in result], CACHE_TTL_USER_LISTS)
    return result


@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_data(user_id: int, db: Session = Depends(database.get_db)):
    cache_key = f"{PREFIX_USER_PROFILE}{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return schemas.UserResponse(**cached)
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
    cache_set(cache_key, user_dict, CACHE_TTL_USER_PROFILE)
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
    invalidate_user_profile(user_id)
    invalidate_user_list_caches()
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
    cache_key = PREFIX_USERS_ROLE_USER
    cached = cache_get(cache_key)
    if cached is not None:
        return [schemas.UserListResponse(**item) for item in cached]
    users = db.query(models.User).filter(
        models.User.role == models.UserRole.USER.value
    ).all()
    result = [
        schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=getattr(user, 'profile_pic', None),
            role=user.role
        )
        for user in users
    ]
    cache_set(cache_key, [r.model_dump(mode="json") for r in result], CACHE_TTL_USER_LISTS)
    return result