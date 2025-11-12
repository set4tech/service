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

        # Try to fetch from S3, with fallback to alternative capitalization
        try:
            response = self.s3_client.get_object(Bucket=BUCKET_NAME, Key=s3_key)
            html_content = response["Body"].read().decode("utf-8")
            return html_content
        except self.s3_client.exceptions.NoSuchKey:
            # Try alternative capitalizations
            alternatives = []

            # Try all uppercase version (but keep extension lowercase)
            filename, ext = key.rsplit(".", 1) if "." in key else (key, "")
            alt_upper = filename.upper()
            # Also fix spacing issues like "Commercial Buildings" -> "COMMERCIALBUILDINGS"
            alt_upper = alt_upper.replace("COMMERCIAL BUILDINGS", "COMMERCIALBUILDINGS")
            if ext:
                alt_upper = f"{alt_upper}.{ext}"
            alternatives.append(alt_upper)

            # Try title case version
            alt_title = key.replace("CHAPTER", "Chapter").replace("CALIFORNIA", "California").replace("BUILDING", "Building").replace("CODE", "Code").replace("VOLUMES", "Volumes").replace("TITLE", "Title").replace("PART", "Part").replace(" AND ", " and ")
            # Fix spacing
            alt_title = alt_title.replace("COMMERCIALBUILDINGS", "Commercial Buildings")
            alternatives.append(alt_title)

            # Try each alternative
            for alt_key in alternatives:
                if alt_key == key:  # Skip if same as original
                    continue
                try:
                    alt_s3_key = f"raw/{self.state}/{self.version}/{alt_key}"
                    logger.info(f"Trying alternative S3 key: {alt_s3_key}")
                    response = self.s3_client.get_object(Bucket=BUCKET_NAME, Key=alt_s3_key)
                    html_content = response["Body"].read().decode("utf-8")
                    logger.info(f"Successfully fetched using alternative key: {alt_key}")
                    return html_content
                except self.s3_client.exceptions.NoSuchKey:
                    continue

            # If all attempts failed, raise the original error
            logger.error(f"Could not find chapter {chapter_name} in S3. Tried:")
            logger.error(f"  - {s3_key}")
            for alt_key in alternatives:
                logger.error(f"  - raw/{self.state}/{self.version}/{alt_key}")
            raise ValueError(f"Chapter file not found in S3: {chapter_name}")


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
    except requests.exceptions.HTTPError as e:
        # Silently skip 404 errors (missing images)
        if e.response.status_code == 404:
            logger.debug(f"Image not found (404): {image_url}")
        else:
            logger.warning(f"Failed to upload image {image_url}: {e}")
        return ""
    except Exception as e:
        logger.warning(f"Failed to upload image {image_url}: {e}")
        return ""
