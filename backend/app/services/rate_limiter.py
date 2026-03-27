import time
import logging
from fastapi import HTTPException, status, Request, Response
from ..cache import _get_client

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    A Redis-based rate limiter for FastAPI.
    """
    def __init__(self, requests_limit: int = 5, window_seconds: int = 10):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds

    async def __call__(self, request: Request, response: Response):
        client = _get_client()
        if not client:
            return

        user_id = getattr(request.state, "user_id", None)
        identity = f"rate_limit:{user_id}" if user_id else f"rate_limit:{request.client.host}"

        try:
            current_time = int(time.time())
            pipe = client.pipeline()
            pipe.zremrangebyscore(identity, 0, current_time - self.window_seconds)
            pipe.zadd(identity, {str(current_time + time.time()): current_time})
            pipe.zcard(identity)
            pipe.expire(identity, self.window_seconds + 1)
            results = pipe.execute()
            
            request_count = results[2]
            remaining = max(0, self.requests_limit - request_count)
            
            # Set headers for the response
            response.headers["X-Rate-Limit-Limit"] = str(self.requests_limit)
            response.headers["X-Rate-Limit-Remaining"] = str(remaining)
            response.headers["X-Rate-Limit-Reset"] = str(self.window_seconds)

            if request_count > self.requests_limit:
                logger.warning(f"Rate limit exceeded for {identity}: {request_count} requests")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "message": "Too many requests. Please slow down.",
                        "retry_after": self.window_seconds
                    },
                    headers={
                        "Retry-After": str(self.window_seconds),
                        "X-Rate-Limit-Limit": str(self.requests_limit),
                        "X-Rate-Limit-Remaining": "0",
                        "X-Rate-Limit-Reset": str(self.window_seconds)
                    }
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Rate limiter error: {e}")
            return
