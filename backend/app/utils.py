import os
from typing import Optional
from fastapi import Request

def get_photo_url(request: Request, photo_path: Optional[str]) -> Optional[str]:
    """
    Helper to convert stored path to a full public URL.
    Handles both S3 full URLs and local relative paths.
    Ensures correct protocol and host when behind a reverse proxy.
    """
    if not photo_path:
        return None
    
    # If it's already a full URL (S3, external) or data URI, return as is
    if photo_path.startswith(("http", "data:")):
        return photo_path
        
    try:
        # If request is None (fallback), return raw filename for client to handle
        if request is None:
            return os.path.basename(photo_path)

        # Check for proxy headers to construct the correct base URL
        # Priority: X-Forwarded headers -> Host header -> Request URL info
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
        
        # 1. If it is an S3 URL, return it directly
        if "s3.amazonaws.com" in photo_path:
            return photo_path

        # Avoid using internal upstream names
        if host and ("backend_servers" in host.lower() or "backend" in host.lower()):
            # If we're behind Nginx and it didn't pass the host correctly, 
            # we can't reliably build a full URL here. 
            # Returning just the relative path might be better than a broken internal URL.
            return f"/static/profile_pics/{os.path.basename(photo_path)}"
            
        base_url = f"{proto}://{host}"
        
        filename = os.path.basename(photo_path)
        return f"{base_url}/static/profile_pics/{filename}"
    except Exception:
        # Fallback if request info is not fully available
        return photo_path
