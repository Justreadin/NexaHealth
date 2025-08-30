# Use a small official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Cloud Run expects the app to listen on 0.0.0.0:$PORT (default 8080)
EXPOSE 8080

# Run with Uvicorn (no reload, single worker — Cloud Run scales automatically)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
