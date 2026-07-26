"""Simple Cloudflare R2 connectivity check.

Usage:
  python test_r2_connection.py

It loads .env from this folder and verifies access by listing up to 5 objects.
"""

from __future__ import annotations

import os
import sys

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv


def _required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def main() -> int:
    load_dotenv()

    try:
        account_id = _required("R2_ACCOUNT_ID")
        bucket = _required("R2_BUCKET_NAME")
        access_key = _required("R2_ACCESS_KEY_ID")
        secret_key = _required("R2_SECRET_ACCESS_KEY")
    except RuntimeError as exc:
        print(f"[ERROR] {exc}")
        return 1

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    region_name = os.getenv("R2_REGION_NAME", "auto")

    try:
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region_name,
            config=Config(signature_version="s3v4"),
        )

        response = client.list_objects_v2(Bucket=bucket, MaxKeys=5)
        object_count = response.get("KeyCount", 0)
        print(f"[OK] Connected to R2 bucket '{bucket}' at {endpoint}")
        print(f"[OK] list_objects_v2 succeeded; key_count={object_count}")

        for item in response.get("Contents", []):
            key = item.get("Key", "")
            size = item.get("Size", 0)
            print(f" - {key} ({size} bytes)")

        return 0
    except (ClientError, BotoCoreError) as exc:
        print(f"[ERROR] R2 request failed: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
