FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (if needed for ML libs)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies first
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all app files
COPY . .

# Expose port Cloud Run expects
EXPOSE 8080

# Run FastAPI app
# app/main.py contains "app = FastAPI()"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
