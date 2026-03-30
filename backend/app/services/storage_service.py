import os
import boto3
import uuid
import logging
import io
from botocore.exceptions import ClientError
from typing import Optional, Tuple
from PIL import Image, ImageOps

from .. import config

logger = logging.getLogger(__name__)

class S3StorageService:
    def __init__(self):
        self.bucket_name = config.AWS_S3_BUCKET_NAME
        self.region = config.AWS_S3_REGION
        self.access_key = config.AWS_ACCESS_KEY_ID
        self.secret_key = config.AWS_SECRET_ACCESS_KEY
        
        self._s3_client = None
        if self.is_configured:
            try:
                self._s3_client = boto3.client(
                    's3',
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key,
                    region_name=self.region
                )
            except Exception as e:
                logger.error(f"❌ Failed to initialize S3 client: {e}")
                self._s3_client = None
        else:
            logger.warning("⚠️ S3 credentials not fully configured. Falling back to local storage for non-s3_only operations.")

    @property
    def is_configured(self) -> bool:
        """Returns True if S3 is fully configured."""
        return all([self.bucket_name, self.access_key, self.secret_key])

    @property
    def s3_client(self):
        """Returns the S3 client if configured, otherwise None."""
        return self._s3_client

    def upload_profile_pic(self, file_content: bytes, filename: str) -> Optional[str]:
        """
        Uploads an image to S3 or local fallback.
        Returns the full URL or relative local path.
        """
        try:
            optimized_content = self._optimize_image(file_content)
        except Exception as e:
            logger.error(f"❌ Image optimization failed: {e}")
            optimized_content = file_content

        if self.s3_client:
            try:
                ext = os.path.splitext(filename)[1].lower() if os.path.splitext(filename)[1] else '.jpg'
                unique_filename = f"profile_pics/{uuid.uuid4().hex}{ext}"
                
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=unique_filename,
                    Body=optimized_content,
                    ContentType='image/jpeg'
                )
                
                url = self._get_s3_url(unique_filename)
                logger.info(f"✅ Successfully uploaded profile pic to S3: {url}")
                return url
            except Exception as e:
                logger.error(f"❌ S3 Upload failed, falling back to local: {e}")

        return self._save_local(optimized_content, filename, "profile_pics")

    def upload_file(self, file_content: bytes, filename: str, folder: str = "attachments", content_type: Optional[str] = None, s3_only: bool = False) -> Optional[str]:
        """
        Uploads a general file to S3 or local fallback.
        If s3_only is True, it will only upload to S3.
        Raises ValueError if s3_only is True and S3 is not configured.
        """
        if not self.is_configured and s3_only:
            raise ValueError("S3 storage is not configured. Please set AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY environment variables.")

        if self.s3_client:
            try:
                ext = os.path.splitext(filename)[1].lower() if os.path.splitext(filename)[1] else ''
                unique_filename = f"{folder}/{uuid.uuid4().hex}{ext}"

                if not content_type:
                    content_type = 'application/octet-stream'

                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=unique_filename,
                    Body=file_content,
                    ContentType=content_type
                )
                
                url = self._get_s3_url(unique_filename)
                logger.info(f"✅ Successfully uploaded file to S3: {url}")
                return url
            except Exception as e:
                logger.error(f"❌ S3 File upload failed: {e}")
                if s3_only:
                    return None 
        
        if s3_only:
             return None

        return self._save_local(file_content, filename, folder)

    def delete_file(self, file_url: str) -> bool:
        if not file_url:
            return False
            
        if "s3.amazonaws.com" in file_url:
            if not self.s3_client:
                logger.warning("S3 not configured, cannot delete file.")
                return False
            try:
                key = file_url.split(".amazonaws.com/")[-1]
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
                logger.info(f"🗑️ Deleted S3 object: {key}")
                return True
            except Exception as e:
                logger.error(f"❌ S3 Delete failed: {e}")
                return False
        
        if file_url.startswith("/static/"):
            try:
                relative_path = file_url.lstrip("/static/")
                file_path = os.path.join(os.getcwd(), "static", relative_path)
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"🗑️ Deleted local file: {file_path}")
                    return True
            except Exception as e:
                logger.error(f"❌ Local delete failed: {e}")
        
        return False
        
    def _get_s3_url(self, key: str) -> str:
        """Constructs the S3 URL based on the region."""
        if self.region == 'us-east-1':
            return f"https://{self.bucket_name}.s3.amazonaws.com/{key}"
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"

    def _save_local(self, file_content: bytes, filename: str, folder: str) -> Optional[str]:
        """Internal helper to save file to local static directory."""
        try:
            static_dir = os.path.join(os.getcwd(), "static", folder)
            os.makedirs(static_dir, exist_ok=True)
            
            ext = os.path.splitext(filename)[1].lower() if os.path.splitext(filename)[1] else ''
            unique_filename = f"{uuid.uuid4().hex}{ext}"
            file_path = os.path.join(static_dir, unique_filename)
            
            with open(file_path, "wb") as f:
                f.write(file_content)
            
            url = f"/static/{folder}/{unique_filename}"
            logger.info(f"✅ Successfully saved file locally: {url}")
            return url
        except Exception as e:
            logger.error(f"❌ Local storage failed: {e}")
            return None

    def _optimize_image(self, file_content: bytes) -> bytes:
        img = Image.open(io.BytesIO(file_content))
        
        try:
            img = ImageOps.exif_transpose(img)
        except Exception as e:
            logger.warning(f"Could not transpose image EXIF: {e}")

        if img.mode != "RGB":
            img = img.convert("RGB")
        
        img.thumbnail((150, 150), Image.Resampling.LANCZOS)
        
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85, optimize=True)
        return buffer.getvalue()
