#!/usr/bin/env python3
"""Debug script to test R2 connection and list objects."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.client import Config

# Load environment variables from the api-gateway .env file
env_path = Path(__file__).parent / "apps" / "api-gateway" / ".env"
print(f"Loading .env from: {env_path}")
print(f"File exists: {env_path.exists()}")
load_dotenv(env_path)

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_REGION_NAME = os.getenv("R2_REGION_NAME", "auto")

print(f"R2_ACCOUNT_ID: {R2_ACCOUNT_ID}")
print(f"R2_BUCKET_NAME: {R2_BUCKET_NAME}")
print(f"R2_ACCESS_KEY_ID: {R2_ACCESS_KEY_ID[:10] if R2_ACCESS_KEY_ID else 'NOT SET'}...")
print(f"R2_REGION_NAME: {R2_REGION_NAME}")

endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
print(f"Endpoint URL: {endpoint_url}")

# Create S3 client
client = boto3.client(
    "s3",
    endpoint_url=endpoint_url,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name=R2_REGION_NAME,
    config=Config(signature_version="s3v4"),
)

# Test 1: List all buckets
print("\n=== Test 1: List all buckets ===")
try:
    response = client.list_buckets()
    print(f"Buckets: {[b['Name'] for b in response.get('Buckets', [])]}")
except Exception as e:
    print(f"ERROR listing buckets: {e}")
    sys.exit(1)

# Test 2: List all objects (no prefix)
print("\n=== Test 2: List all objects (no prefix) ===")
try:
    response = client.list_objects_v2(Bucket=R2_BUCKET_NAME)
    files = response.get("Contents", [])
    print(f"Found {len(files)} objects in bucket")
    if len(files) > 0:
        print("First 5 objects:")
        for obj in files[:5]:
            print(f"  - {obj['Key']} ({obj.get('Size', 0)} bytes)")
except Exception as e:
    print(f"ERROR listing objects: {e}")
    sys.exit(1)

# Test 3: List with toefl-test-assets prefix
print("\n=== Test 3: List with 'toefl-test-assets/' prefix ===")
prefix = "toefl-test-assets/"
try:
    response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=prefix)
    files = response.get("Contents", [])
    print(f"Found {len(files)} objects with prefix '{prefix}'")
    if len(files) > 0:
        print("Sample objects:")
        for obj in files[:5]:
            print(f"  - {obj['Key']} ({obj.get('Size', 0)} bytes)")
except Exception as e:
    print(f"ERROR listing objects with prefix: {e}")

# Test 3b: List ALL objects to see the structure
print("\n=== Test 3b: List ALL objects to see structure ===")
try:
    paginator = client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=R2_BUCKET_NAME)
    all_objects = []
    for page in pages:
        all_objects.extend(page.get('Contents', []))
    
    print(f"Total objects in bucket: {len(all_objects)}")
    print("All object keys:")
    for obj in all_objects:
        print(f"  - {obj['Key']} ({obj.get('Size', 0)} bytes)")
except Exception as e:
    print(f"ERROR: {e}")

# Test 4: List specific audio folder
print("\n=== Test 4: List specific audio folder ===")
folder_prefix = "toefl-test-assets/audio/listening/sets/listening_2026-10-10_1785470139041_s7hhnv/"
try:
    response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=folder_prefix)
    files = response.get("Contents", [])
    print(f"Found {len(files)} objects in folder '{folder_prefix}'")
    if len(files) > 0:
        for obj in files:
            print(f"  - {obj['Key']} ({obj.get('Size', 0)} bytes)")
    else:
        print("No objects found - checking alternative paths...")
        # Try without the trailing slash
        alt_prefix = "toefl-test-assets/audio/listening/sets/listening_2026-10-10_1785470139041_s7hhnv"
        response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=alt_prefix)
        files = response.get("Contents", [])
        print(f"  Alternative (no trailing slash): Found {len(files)} objects")
        
        # Try just the base path
        alt_prefix2 = "toefl-test-assets/audio/listening/"
        response = client.list_objects_v2(Bucket=R2_BUCKET_NAME, Prefix=alt_prefix2)
        files = response.get("Contents", [])
        print(f"  Base path: Found {len(files)} objects with 'toefl-test-assets/audio/listening/'")
        if len(files) > 0:
            print("    Sample objects:")
            for obj in files[:10]:
                print(f"      - {obj['Key']} ({obj.get('Size', 0)} bytes)")
        
except Exception as e:
    print(f"ERROR listing objects in folder: {e}")
    import traceback
    traceback.print_exc()

print("\n=== Done ===")
