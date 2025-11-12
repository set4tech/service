"""S3 utilities for ICC code scraping."""
import requests
import logging
import boto3

logger = logging.getLogger(__name__)

BUCKET_NAME = "set4-codes"


class RawICCS3:
    """Handles fetching raw HTML from S3 for ICC codes."""

    def __init__(self, state: str, version: int, chapter_to_key: dict):
        """
        Initialize S3 client for ICC code access.

        Args:
            state: State code (e.g., 'CA')
            version: Year version (e.g., 2025)
            chapter_to_key: Mapping of chapter names to S3 keys
        """
        self.state = state
        self.version = version
        self.chapter_to_key = chapter_to_key
        self.s3_client = boto3.client("s3")

    def chapter(self, chapter_name: str) -> str:
        """
        Fetch chapter HTML from S3.

        Args:
            chapter_name: Name of the chapter (e.g., '11a', '11b')

        Returns:
            HTML content as string
        """
        key = self.chapter_to_key.get(chapter_name)
        if not key:
            raise ValueError(f"Unknown chapter: {chapter_name}")

        # Construct S3 key path
        s3_key = f"raw/{self.state}/{self.version}/{key}"

        # Fetch from S3
        response = self.s3_client.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        html_content = response["Body"].read().decode("utf-8")

        return html_content


def upload_image_to_s3(image_url: str, s3_key: str, s3_bucket: str = "set4-codes") -> str:
    """Download image from URL and upload to S3. Returns S3 URL or empty string."""
    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=s3_bucket,
            Key=s3_key,
            Body=response.content,
            ContentType="image/jpeg",
        )
        
        logger.info(f"Uploaded image to S3: s3://{s3_bucket}/{s3_key}")
        return f"https://{s3_bucket}.s3.amazonaws.com/{s3_key}"
    except Exception as e:
        logger.warning(f"Failed to upload image {image_url}: {e}")
        return ""
