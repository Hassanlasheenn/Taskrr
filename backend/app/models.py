from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class PriorityLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TodoStatus(str, enum.Enum):
    NEW = "new"
    IN_PROGRESS = "inProgress"
    PAUSED = "paused"
    DONE = "done"


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    profile_pic = Column(Text, nullable=True)
    role = Column(String(20), default=UserRole.USER.value, nullable=False, index=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(255), nullable=True, index=True)
    reset_password_token = Column(String(255), nullable=True, index=True)
    reset_password_expires = Column(DateTime, nullable=True)
    
    todos = relationship("Todo", back_populates="user", foreign_keys="[Todo.user_id]", cascade="all, delete-orphan")


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default=TodoStatus.NEW.value)
    priority = Column(String(20), default=PriorityLevel.MEDIUM.value)
    category = Column(String(100), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())  
    
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    user = relationship("User", back_populates="todos", foreign_keys=[user_id])
    assigned_to_user = relationship("User", foreign_keys=[assigned_to_user_id])
    comments = relationship("TodoComment", back_populates="todo", cascade="all, delete-orphan")
    comment_history = relationship("TodoCommentHistory", back_populates="todo", foreign_keys="[TodoCommentHistory.todo_id]", cascade="all, delete-orphan")
    field_history = relationship("TodoFieldHistory", back_populates="todo", foreign_keys="[TodoFieldHistory.todo_id]", cascade="all, delete-orphan")


class TodoComment(Base):
    __tablename__ = "todo_comments"

    id = Column(Integer, primary_key=True, index=True)
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    attachment_url = Column(String(500), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    todo = relationship("Todo", back_populates="comments", foreign_keys=[todo_id])
    user = relationship("User", foreign_keys=[user_id])


class TodoCommentHistoryAction(str, enum.Enum):
    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"


class TodoCommentHistory(Base):
    __tablename__ = "todo_comment_history"

    id = Column(Integer, primary_key=True, index=True)
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=False)
    comment_id = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)
    content_before = Column(Text, nullable=True)
    content_after = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    todo = relationship("Todo", back_populates="comment_history", foreign_keys=[todo_id])
    user = relationship("User", foreign_keys=[user_id])


class TodoFieldHistory(Base):
    __tablename__ = "todo_field_history"

    id = Column(Integer, primary_key=True, index=True)
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    field = Column(String(50), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    todo = relationship("Todo", back_populates="field_history", foreign_keys=[todo_id])
    user = relationship("User", foreign_keys=[user_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    todo_id = Column(Integer, ForeignKey("todos.id"), nullable=True)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", foreign_keys=[user_id])
    todo = relationship("Todo", foreign_keys=[todo_id])
