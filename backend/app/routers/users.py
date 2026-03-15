import os
import io
import uuid
import logging
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
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

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])

# Directory configuration
STATIC_DIR = "static"
PROFILE_PICS_DIR = os.path.join(STATIC_DIR, "profile_pics")

# Ensure directory exists
if not os.path.exists(PROFILE_PICS_DIR):
    os.makedirs(PROFILE_PICS_DIR, exist_ok=True)


def get_photo_url(request: Request, photo_path: Optional[str]) -> Optional[str]:
    """Helper to convert stored path to a full public URL."""
    if not photo_path:
        return None
    
    # If it's already a full URL (external) or data URI (old legacy), return as is
    if photo_path.startswith(("http", "data:")):
        return photo_path
        
    # Construct full URL: base_url + /static/profile_pics/filename
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/static/profile_pics/{photo_path}"


def save_profile_pic(file_content: bytes, filename: str) -> str:
    """
    Optimizes and saves the image to disk.
    Returns only the filename to be stored in the DB.
    """
    try:
        # Generate unique filename to avoid collisions
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
            ext = '.jpg'
        
        unique_filename = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(PROFILE_PICS_DIR, unique_filename)
        
        # Load image into Pillow
        img = Image.open(io.BytesIO(file_content))
        
        # Convert to RGB (required for JPEG)
        if img.mode != "RGB":
            img = img.convert("RGB")
        
        # Resize to thumbnail (Max 150px)
        img.thumbnail((150, 150), Image.Resampling.LANCZOS)
        
        # Save to disk
        img.save(save_path, format="JPEG", quality=85, optimize=True)
        
        return unique_filename
        
    except Exception as e:
        logger.error(f"Image saving failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to process image")


@router.get("/mentionable", response_model=List[schemas.UserListResponse])
def get_mentionable_users(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Return all users except the current user, for @mentions (includes admins)."""
    cache_key = f"{PREFIX_USERS_MENTIONABLE}{current_user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        # We need to ensure URLs are correct even if host changed
        for item in cached:
            item['photo'] = get_photo_url(request, item.get('photo'))
        return [schemas.UserListResponse(**item) for item in cached]
        
    users = db.query(models.User).filter(models.User.id != current_user.id).all()
    result = []
    for user in users:
        result.append(schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=get_photo_url(request, user.profile_pic),
            role=getattr(user, 'role', 'user'),
            is_verified=user.is_verified
        ))
    
    # Store raw profile_pic paths in cache, convert to URL on retrieval
    cache_data = []
    for user in users:
        cache_data.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "photo": user.profile_pic, # Store path
            "role": getattr(user, 'role', 'user'),
            "is_verified": user.is_verified
        })
    cache_set(cache_key, cache_data, CACHE_TTL_USER_LISTS)
    return result


@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_data(request: Request, user_id: int, db: Session = Depends(database.get_db)):
    cache_key = f"{PREFIX_USER_PROFILE}{user_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        cached['photo'] = get_photo_url(request, cached.get('photo'))
        return schemas.UserResponse(**cached)
        
    user_db = db.query(models.User).filter(models.User.id == user_id).first()
    if user_db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": get_photo_url(request, user_db.profile_pic),
        "role": getattr(user_db, 'role', 'user'),
        "is_verified": user_db.is_verified
    }
    
    # Cache the raw path
    cache_item = user_dict.copy()
    cache_item['photo'] = user_db.profile_pic
    cache_set(cache_key, cache_item, CACHE_TTL_USER_PROFILE)
    
    return schemas.UserResponse(**user_dict)


@router.put("/{user_id}", response_model=schemas.UserResponse)
async def update_user_data(
    request: Request,
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
        # Optional: delete file from disk
        if user_db.profile_pic and not user_db.profile_pic.startswith(("http", "data:")):
            old_path = os.path.join(PROFILE_PICS_DIR, user_db.profile_pic)
            if os.path.exists(old_path):
                os.remove(old_path)
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
        
        # Delete old photo if exists
        if user_db.profile_pic and not user_db.profile_pic.startswith(("http", "data:")):
            old_path = os.path.join(PROFILE_PICS_DIR, user_db.profile_pic)
            if os.path.exists(old_path):
                try: os.remove(old_path)
                except: pass

        user_db.profile_pic = save_profile_pic(content, photo.filename or "photo.jpg")
    
    db.commit()
    db.refresh(user_db)
    invalidate_user_profile(user_id)
    invalidate_user_list_caches()
    
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": get_photo_url(request, user_db.profile_pic),
        "role": getattr(user_db, 'role', 'user'),
        "is_verified": user_db.is_verified
    }
    return schemas.UserResponse(**user_dict)


@router.get("/role/user", response_model=List[schemas.UserListResponse])
def get_users_with_role_user(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    cache_key = PREFIX_USERS_ROLE_USER
    cached = cache_get(cache_key)
    if cached is not None:
        for item in cached:
            item['photo'] = get_photo_url(request, item.get('photo'))
        return [schemas.UserListResponse(**item) for item in cached]
        
    users = db.query(models.User).filter(
        models.User.role == models.UserRole.USER.value
    ).all()
    
    result = []
    for user in users:
        result.append(schemas.UserListResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            photo=get_photo_url(request, user.profile_pic),
            role=user.role,
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
            "role": user.role,
            "is_verified": user.is_verified
        })
    cache_set(cache_key, cache_data, CACHE_TTL_USER_LISTS)
    return result
