"""Neon Object Storage helper (S3-compatible).

Handles photo upload to the private S3 bucket and generates 10-minute
presigned GET URLs for frontend display.
"""

import boto3
from botocore.config import Config
from app.config import (
    STORAGE_ENDPOINT,
    STORAGE_REGION,
    STORAGE_BUCKET,
    STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY,
)


def get_s3_client():
    """Create and return configured boto3 S3 client for Neon Object Storage."""
    return boto3.client(
        "s3",
        endpoint_url=STORAGE_ENDPOINT,
        aws_access_key_id=STORAGE_ACCESS_KEY_ID,
        aws_secret_access_key=STORAGE_SECRET_ACCESS_KEY,
        region_name=STORAGE_REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def upload_photo_bytes(storage_key: str, data: bytes, content_type: str = "image/jpeg") -> None:
    """Upload photo byte buffer to Neon Object Storage bucket.

    Args:
        storage_key: S3 object key (e.g. 'photos/batch_123/pho_456.jpg')
        data: Binary photo content
        content_type: MIME type (e.g. 'image/jpeg' or 'image/png')
    """
    s3 = get_s3_client()
    s3.put_object(
        Bucket=STORAGE_BUCKET,
        Key=storage_key,
        Body=data,
        ContentType=content_type,
    )


def generate_presigned_url(storage_key: str, expires_in: int = 600) -> str:
    """Generate a temporary signed URL to view a photo.

    Default expiry is 600 seconds (10 minutes) as specified in DEVELOPMENT.md.

    Args:
        storage_key: S3 object key
        expires_in: Expiry duration in seconds (default: 600)

    Returns:
        Presigned GET URL string
    """
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": STORAGE_BUCKET, "Key": storage_key},
        ExpiresIn=expires_in,
    )
