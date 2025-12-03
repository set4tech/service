FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV, poppler (pdf2image), and tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Download YOLO weights at build time (Railway passes env vars as build args)
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
RUN if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then \
    python -c "import boto3; s3 = boto3.client('s3', region_name='us-east-1', aws_access_key_id='$AWS_ACCESS_KEY_ID', aws_secret_access_key='$AWS_SECRET_ACCESS_KEY'); s3.download_file('set4-data', 'models/weights.pt', 'weights.pt'); print('Downloaded weights.pt')"; \
    else echo 'AWS credentials not available at build time'; fi

# Expose port (Railway sets $PORT)
EXPOSE 8000

# Start the server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
