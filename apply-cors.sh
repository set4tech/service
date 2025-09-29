#!/bin/bash

# Apply CORS configuration to S3 bucket
aws s3api put-bucket-cors \
  --bucket service-uploads \
  --cors-configuration file://s3-cors-config.json \
  --region us-east-1

if [ $? -eq 0 ]; then
  echo "✅ CORS configuration applied successfully to bucket: service-uploads"
else
  echo "❌ Failed to apply CORS configuration"
fi