import os
import io
import uuid
import logging
from PIL import Image, ImageOps
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
from ..services.storage_service import S3StorageService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])
storage_service = S3StorageService()

# Local directory configuration (for fallback/legacy)
STATIC_DIR = "static"
PROFILE_PICS_DIR = os.path.join(STATIC_DIR, "profile_pics")


def get_photo_url(request: Request, photo_path: Optional[str]) -> Optional[str]:
    """
    Helper to convert stored path to a full public URL.
    Handles both S3 full URLs and local relative paths.
    """
    if not photo_path:
        return None
    
    # If it's already a full URL (S3, external) or data URI, return as is
    if photo_path.startswith(("http", "data:")):
        # Some S3 URLs might be stored without the scheme if not careful, 
        # but here we assume they are full URLs.
        return photo_path
        
    # Construct full URL for local files: base_url + /static/profile_pics/filename
    # Ensure request is available to get the base_url
    try:
        base_url = str(request.base_url).rstrip("/")
        # Avoid double /static/profile_pics if it was somehow stored with it
        filename = os.path.basename(photo_path)
        return f"{base_url}/static/profile_pics/{filename}"
    except Exception:
        # Fallback if request is not available (e.g. in some background tasks)
        return photo_path


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
    
    # Cache raw paths/URLs
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
    
    # Cache raw path/URL
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
        # Delete from S3 if it's an S3 URL
        if user_db.profile_pic and "s3.amazonaws.com" in user_db.profile_pic:
            storage_service.delete_file(user_db.profile_pic)
        
        # Local legacy cleanup
        elif user_db.profile_pic and not user_db.profile_pic.startswith("data:"):
            old_path = os.path.join(PROFILE_PICS_DIR, user_db.profile_pic)
            if os.path.exists(old_path):
                try: os.remove(old_path)
                except: pass
                
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
        
        # 1. Delete old photo if it exists in S3
        if user_db.profile_pic and "s3.amazonaws.com" in user_db.profile_pic:
            storage_service.delete_file(user_db.profile_pic)
            
        # 2. Upload new photo to S3
        s3_url = storage_service.upload_profile_pic(content, photo.filename or "photo.jpg")
        
        if s3_url:
            user_db.profile_pic = s3_url
        else:
            # Fallback to local if S3 fails
            logger.warning("S3 upload failed, using local storage fallback")
            unique_filename = f"{uuid.uuid4().hex}.jpg"
            if not os.path.exists(PROFILE_PICS_DIR):
                os.makedirs(PROFILE_PICS_DIR, exist_ok=True)
            
            save_path = os.path.join(PROFILE_PICS_DIR, unique_filename)
            img = Image.open(io.BytesIO(content))
            
            # Handle EXIF orientation metadata
            try:
                img = ImageOps.exif_transpose(img)
            except Exception as e:
                logger.warning(f"Could not transpose image EXIF: {e}")

            img.thumbnail((150, 150), Image.Resampling.LANCZOS)
            img.save(save_path, format="JPEG", quality=85)
            user_db.profile_pic = unique_filename
    
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
        
    # Cache raw paths/URLs
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
