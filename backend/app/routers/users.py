import base64
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from .. import database, models, schemas


router = APIRouter(tags=["users"])


def image_to_base64(file_content: bytes, content_type: str) -> str:
    """Convert image bytes to base64 data URL"""
    base64_data = base64.b64encode(file_content).decode('utf-8')
    return f"data:{content_type};base64,{base64_data}"

# get user by ID
@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_data(user_id: int, db: Session = Depends(database.get_db)):
    # find user with the id
    user_db = db.query(models.User).filter(models.User.id == user_id).first()
    if user_db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Map profile_pic to photo for response (handle case where column might not exist)
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": getattr(user_db, 'profile_pic', None)  # Safely get profile_pic, default to None if doesn't exist
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
    # find user with the id
    user_db = db.query(models.User).filter(models.User.id == user_id).first()
    if user_db is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # update user data
    if username is not None:
        user_db.username = username
    if email is not None:
        user_db.email = email
    
    # Handle profile picture deletion
    if delete_photo and delete_photo.lower() == 'true':
        user_db.profile_pic = None
    
    # Handle profile picture upload
    elif photo:
        # Validate file type
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Read file content
        content = await photo.read()
        
        # Validate file size (max 5MB)
        if len(content) > 5 * 1024 * 1024:  # 5MB
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File size must be less than 5MB"
            )
        
        # Convert to base64 and store in database
        user_db.profile_pic = image_to_base64(content, photo.content_type)
    
    db.commit()
    db.refresh(user_db)
    
    # Map profile_pic to photo for response
    user_dict = {
        "id": user_db.id,
        "username": user_db.username,
        "email": user_db.email,
        "photo": user_db.profile_pic
    }
    return schemas.UserResponse(**user_dict)