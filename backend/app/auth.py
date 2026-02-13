import os
from fastapi.security import OAuth2PasswordRequestForm
import jwt 
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import HTTPException, status
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from . import models, schemas, database
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

ph = PasswordHasher()

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({ "exp": expire })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

router = APIRouter(tags=["auth"])

@router.post("/register", response_model=schemas.LoginResponse)
def register(user: schemas.UserCreate, response: Response, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
    
    hashed_password = hash_password(user.password)

    new_user = models.User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        role=models.UserRole.USER.value
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token and set cookie (same as login)
    user_role = getattr(new_user, 'role', 'user')
    access_token = create_access_token(data={"sub": new_user.email, "role": user_role})
    
    max_age = 7 * 24 * 60 * 60
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=max_age,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/"
    )
    
    user_dict = {
        "id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "photo": getattr(new_user, 'profile_pic', None),
        "role": getattr(new_user, 'role', 'user')
    }
    
    return { 
        "token_type": "bearer",
        "access_token": access_token,
        "data": schemas.UserResponse(**user_dict)
    }


@router.post("/login", response_model=schemas.LoginResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(database.get_db),
    response: Response = Response()
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
    
    # Include role in token
    user_role = getattr(user, 'role', 'user')
    access_token = create_access_token(data={"sub": user.email, "role": user_role})
    
    max_age = 7 * 24 * 60 * 60
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=max_age,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/"
    )
    
    user_dict = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "photo": getattr(user, 'profile_pic', None),
        "role": getattr(user, 'role', 'user')
    }
    
    return { 
        "token_type": "bearer",
        "access_token": access_token,  # Include token in response for header-based auth
        "data": schemas.UserResponse(**user_dict)
    }


@router.post("/logout")
def logout(response: Response = Response()):
    response.delete_cookie(
        key="access_token",
        path="/",
        samesite="lax"
    )
    return {"message": "Logged out successfully"}