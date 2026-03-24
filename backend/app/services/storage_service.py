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
        # Use values from config.py which has already called load_dotenv()
        self.bucket_name = config.AWS_S3_BUCKET_NAME
        self.region = config.AWS_S3_REGION
        self.access_key = config.AWS_ACCESS_KEY_ID
        self.secret_key = config.AWS_SECRET_ACCESS_KEY
        
        if not all([self.bucket_name, self.access_key, self.secret_key]):
            logger.warning("⚠️ S3 credentials not fully configured. Bucket: %s, AccessKey: %s. Falling back to local storage.",
                           self.bucket_name, "Set" if self.access_key else "Not Set")
            self.s3_client = None
        else:
            try:
                self.s3_client = boto3.client(
                    's3',
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key,
                    region_name=self.region
                )
                # Verify bucket exists (optional, but good for early failure)
                # self.s3_client.head_bucket(Bucket=self.bucket_name)
            except Exception as e:
                logger.error(f"❌ Failed to initialize S3 client: {e}")
                self.s3_client = None

    def upload_profile_pic(self, file_content: bytes, filename: str) -> Optional[str]:
        """
        Uploads an image to S3.
        Returns the full S3 URL or None if failed.
        """
        if not self.s3_client:
            return None

        try:
            # Generate unique filename
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
                ext = '.jpg'
            
            unique_filename = f"profile_pics/{uuid.uuid4().hex}{ext}"
            
            # Optimize image before upload
            optimized_content = self._optimize_image(file_content)
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Body=optimized_content,
                ContentType='image/jpeg'
            )
            
            # Construct public URL
            # Note: For us-east-1 the URL format is slightly different, but this works for most regions
            if self.region == 'us-east-1':
                url = f"https://{self.bucket_name}.s3.amazonaws.com/{unique_filename}"
            else:
                url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{unique_filename}"
                
            logger.info(f"✅ Successfully uploaded image to S3: {url}")
            return url

        except ClientError as e:
            logger.error(f"❌ S3 Upload failed (ClientError): {e}")
            return None
        except Exception as e:
            logger.error(f"❌ Image processing or S3 upload failed: {e}")
            return None

    def upload_file(self, file_content: bytes, filename: str, folder: str = "attachments") -> Optional[str]:
        """
        Uploads a general file to S3.
        Returns the full S3 URL or None if failed.
        """
        if not self.s3_client:
            return None

        try:
            # Generate unique filename to avoid collisions
            ext = os.path.splitext(filename)[1].lower()
            unique_filename = f"{folder}/{uuid.uuid4().hex}{ext}"
            
            # Detect content type (simplistic)
            content_type = 'application/octet-stream'
            if ext in ['.jpg', '.jpeg', '.png', '.webp']: content_type = 'image/jpeg'
            elif ext == '.pdf': content_type = 'application/pdf'
            elif ext in ['.doc', '.docx']: content_type = 'application/msword'
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Body=file_content,
                ContentType=content_type
            )
            
            # Construct public URL
            if self.region == 'us-east-1':
                url = f"https://{self.bucket_name}.s3.amazonaws.com/{unique_filename}"
            else:
                url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{unique_filename}"
                
            logger.info(f"✅ Successfully uploaded file to S3: {url}")
            return url

        except Exception as e:
            logger.error(f"❌ S3 General upload failed: {e}")
            return None

    def delete_file(self, file_url: str) -> bool:
        """Deletes a file from S3 given its full URL."""
        if not self.s3_client or not file_url:
            return False
            
        try:
            # Extract key from URL
            # Expected format: https://bucket.s3.region.amazonaws.com/key
            if self.bucket_name in file_url:
                key = file_url.split(f"{self.bucket_name}.s3.{self.region}.amazonaws.com/")[-1]
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
                logger.info(f"🗑️ Deleted S3 object: {key}")
                return True
            return False
        except Exception as e:
            logger.error(f"❌ S3 Delete failed: {e}")
            return False

    def _optimize_image(self, file_content: bytes) -> bytes:
        """Internal helper to resize and compress image before S3 upload."""
        img = Image.open(io.BytesIO(file_content))
        
        # Handle EXIF orientation metadata (prevent images from being flipped/rotated)
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
