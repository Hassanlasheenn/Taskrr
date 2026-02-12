from pydantic import BaseModel, EmailStr, field_serializer
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


class PriorityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    photo: Optional[str] = None
    role: Optional[str] = "user"

    class Config:
        from_attributes = True

class UserListResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    photo: Optional[str] = None
    role: str

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role: Literal["user", "admin"]

class LoginResponse(BaseModel):
    token_type: str = "bearer"
    access_token: Optional[str] = None  # Optional for backward compatibility, but included for header-based auth
    data: UserResponse


class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: PriorityLevel = PriorityLevel.MEDIUM
    category: Optional[str] = None
    assigned_to_user_id: Optional[int] = None

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    priority: Optional[PriorityLevel] = None
    category: Optional[str] = None
    assigned_to_user_id: Optional[int] = None

class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    completed: bool
    priority: str
    category: Optional[str] = None
    order_index: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    user_id: int
    assigned_to_user_id: Optional[int] = None
    assigned_to_username: Optional[str] = None

    class Config:
        from_attributes = True

    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        """Serialize datetime without timezone (Z) suffix"""
        if value is None:
            return None
        return value.strftime('%Y-%m-%dT%H:%M:%S')

class TodoListResponse(BaseModel):
    todos: List[TodoResponse]
    total: int


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    todo_id: Optional[int] = None
    message: str
    is_read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @field_serializer('created_at')
    def serialize_datetime(self, value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
        return value.strftime('%Y-%m-%dT%H:%M:%S')


class NotificationListResponse(BaseModel):
    notifications: List[NotificationResponse]
    total: int
    unread_count: int