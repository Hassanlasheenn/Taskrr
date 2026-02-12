from typing import Dict, Set
from fastapi import WebSocket
import json
import logging

logger = logging.getLogger(__name__)


class NotificationManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        # Note: websocket.accept() is called in the endpoint before this method
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_notification(self, user_id: int, notification_data: dict):
        if user_id in self.active_connections:
            try:
                message = json.dumps(notification_data, default=str)
            except TypeError as e:
                logger.error(f"Error serializing notification data: {e}")
                return

            disconnected = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(message)
                except Exception:
                    logger.error(f"Error sending notification to {user_id}: {e}")
                    disconnected.add(websocket)
            for ws in disconnected:
                self.disconnect(user_id, ws)


notification_manager = NotificationManager()
