import os
import secrets
from fastapi.security import OAuth2PasswordRequestForm
import jwt 
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from . import models, schemas, database

# Load environment variables from .env file
load_dotenv()

# Get configuration from environment variables with defaults
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

ph = PasswordHasher()

# define the password hashing function
def hash_password(password: str) -> str:
    return ph.hash(password)

# define the password verify function
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False


# generate the jwt token
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({ "exp": expire })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

router = APIRouter(tags=["auth"])

@router.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    # check if user exists
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
    
    hashed_password = hash_password(user.password)

    # save to sql
    new_user = models.User(email=user.email, username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Map profile_pic to photo for response (handle case where column might not exist)
    user_dict = {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "photo": getattr(new_user, 'profile_pic', None)  # Safely get profile_pic, default to None if doesn't exist
    }
    return schemas.UserResponse(**user_dict)


# login user
@router.post("/login", response_model=schemas.LoginResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(database.get_db),
    response: Response = Response()
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
    
    access_token = create_access_token(data={"sub": user.email})
    
    # Set httpOnly cookie with secure settings
    # Token expires in 7 days
    max_age = 7 * 24 * 60 * 60  # 7 days in seconds
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=max_age,
        httponly=True,  # Cannot be accessed by JavaScript (XSS protection)
        secure=is_production,  # HTTPS only in production, False for localhost
        samesite="lax",  # CSRF protection (lax allows cross-site navigation)
        path="/"
    )
    
    # Map profile_pic to photo for response (handle case where column might not exist)
    user_dict = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "photo": getattr(user, 'profile_pic', None)  # Safely get profile_pic, default to None if doesn't exist
    }
    
    return { 
        "token_type": "bearer", 
        "data": schemas.UserResponse(**user_dict)
    }


# logout user
@router.post("/logout")
def logout(response: Response = Response()):
    response.delete_cookie(
        key="access_token",
        path="/",
        samesite="lax"
    )
    return {"message": "Logged out successfully"}