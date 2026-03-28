from typing import Dict, Optional
import urllib.parse
from .. import config

class LinkService:
    """
    Central service to generate all application links (Frontend and Backend).
    This ensures consistency, proper encoding, and environment-aware URLs.
    """
    
    def __init__(self):
        self.frontend_url = config.FRONTEND_URL.rstrip("/")
        self.backend_url = str(config.SMTP_SERVER) # Fallback, usually we use the request base_url

    def get_frontend_url(self, path: str, params: Optional[Dict[str, str]] = None) -> str:
        """Generates a full URL to a frontend page."""
        path = path.lstrip("/")
        url = f"{self.frontend_url}/{path}"
        
        if params:
            query_string = urllib.parse.urlencode(params)
            url = f"{url}?{query_string}"
            
        return url

    def get_verification_link(self, token: str, email: str) -> str:
        """Specific helper for email verification links."""
        return self.get_frontend_url("verify-email", {
            "token": token,
            "email": email
        })

    def get_todo_view_link(self, todo_id: int) -> str:
        """Generates a link to view a specific todo."""
        return self.get_frontend_url(f"todo/{todo_id}")

# Global instance for easy import

    def get_password_reset_link(self, token: str) -> str:
        """Specific helper for password reset links."""
        return self.get_frontend_url("reset-password", {
            "token": token
        })

link_service = LinkService()
