FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything inside backend/
COPY . .

# Cloud Run requires listening on 0.0.0.0:$PORT (default 8080)
EXPOSE 8080

# Start FastAPI app from backend/app/main.py
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
