from pydantic import BaseModel, EmailStr, field_serializer
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


# Priority Enum for validation
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

    class Config:
        from_attributes = True

class LoginResponse(BaseModel):
    data: UserResponse


# Todo Schemas
class TodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: PriorityLevel = PriorityLevel.MEDIUM

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None
    priority: Optional[PriorityLevel] = None

class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    completed: bool
    priority: str
    order_index: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    user_id: int

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