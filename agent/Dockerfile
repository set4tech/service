FROM willset4/agent-base:latest

WORKDIR /app

# Copy application code (weights.pt already in base image)
COPY . .

# Expose port (Railway sets $PORT)
EXPOSE 8000

# Start the server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
