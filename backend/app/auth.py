import os
import secrets
import jwt 
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from typing import Optional
from fastapi import HTTPException, status, BackgroundTasks
from fastapi import APIRouter, Depends, Response, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from . import models, schemas, database
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from .cache import invalidate_user_list_caches
from .services.email_service import EmailService
from .routers.notifications import create_welcome_notification
from .utils import get_photo_url

ph = PasswordHasher()
email_service = EmailService()

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
def register(
    request: Request,
    user: schemas.UserCreate, 
    response: Response, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    from sqlalchemy import func, or_
    
    # Check if user exists (case-insensitive email or username)
    existing_user = db.query(models.User).filter(
        or_(
            func.lower(models.User.email) == func.lower(user.email),
            func.lower(models.User.username) == func.lower(user.username)
        )
    ).first()
    
    if existing_user:
        if existing_user.email.lower() == user.email.lower():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
    
    hashed_password = hash_password(user.password)
    verification_token = secrets.token_urlsafe(32)

    new_user = models.User(
        email=user.email,
        username=user.username,
        hashed_password=hashed_password,
        role=models.UserRole.USER.value,
        is_verified=False,
        verification_token=verification_token
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Send verification email in background
    background_tasks.add_task(email_service.send_verification_email, new_user.email, verification_token)
    
    invalidate_user_list_caches()
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
        "photo": get_photo_url(request, getattr(new_user, 'profile_pic', None)),
        "role": getattr(new_user, 'role', 'user'),
        "is_verified": new_user.is_verified
    }
    
    return { 
        "token_type": "bearer",
        "access_token": access_token,
        "data": schemas.UserResponse(**user_dict)
    }


@router.post("/login", response_model=schemas.LoginResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(database.get_db),
    response: Response = Response()
):
    from sqlalchemy import or_, func
    user = db.query(models.User).filter(
        or_(
            func.lower(models.User.email) == func.lower(form_data.username),
            func.lower(models.User.username) == func.lower(form_data.username)
        )
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email/username or password", headers={"WWW-Authenticate": "Bearer"})
    
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Email not verified. Please check your inbox for verification link."
        )

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
        "photo": get_photo_url(request, getattr(user, 'profile_pic', None)),
        "role": getattr(user, 'role', 'user'),
        "is_verified": user.is_verified
    }
    
    return { 
        "token_type": "bearer",
        "access_token": access_token,
        "data": schemas.UserResponse(**user_dict)
    }


@router.post("/refresh", response_model=schemas.LoginResponse)
def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(database.get_db)
):
    token = request.cookies.get("access_token")
    auth_header = request.headers.get("Authorization")
    if not token and auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split("Bearer ")[1]

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        email: Optional[str] = payload.get("sub")
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        # Allow refresh up to 6 days after the token originally expired
        exp = payload.get("exp")
        if exp:
            token_expiry = datetime.fromtimestamp(exp, tz=timezone.utc)
            refresh_deadline = token_expiry + timedelta(days=6)
            if datetime.now(timezone.utc) > refresh_deadline:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session fully expired. Please log in again."
                )
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

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
        "photo": get_photo_url(request, getattr(user, 'profile_pic', None)),
        "role": user_role,
        "is_verified": user.is_verified
    }

    return {
        "token_type": "bearer",
        "access_token": access_token,
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

@router.get("/verify-email")
async def verify_email(
    token: str, 
    background_tasks: BackgroundTasks,
    email: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    # 1. Try to find user by token
    user = db.query(models.User).filter(models.User.verification_token == token).first()
    
    # 2. If not found by token, but email is provided, check if already verified
    if not user and email:
        user_by_email = db.query(models.User).filter(models.User.email == email).first()
        if user_by_email and user_by_email.is_verified:
            return {"message": "Email already verified successfully. You can now login."}
    
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")
    
    user.is_verified = True
    user.verification_token = None
    db.commit()
    
    # Create a welcome notification in the background
    background_tasks.add_task(create_welcome_notification, db, user.id, user.username)
    
    return {"message": "Email verified successfully. You can now login."}

@router.post("/resend-verification")
async def resend_verification(
    email: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db)
):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        # We return 200 even if user not found for security (don't reveal registered emails)
        return {"message": "If an account exists with this email, a new link has been sent."}
    
    if user.is_verified:
        return {"message": "This account is already verified."}
    
    # Generate new token
    verification_token = secrets.token_urlsafe(32)
    user.verification_token = verification_token
    db.commit()
    
    # Send email
    background_tasks.add_task(email_service.send_verification_email, user.email, verification_token)
    
    return {"message": "Verification link resent successfully."}
