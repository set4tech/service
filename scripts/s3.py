"""S3 utilities for ICC code scraping."""

import os
import boto3

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
