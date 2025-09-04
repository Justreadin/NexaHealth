FROM python:3.11-slim

WORKDIR /app

# Copy dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8080

# Run FastAPI app
CMD ["uvicorn", "run:app", "--host", "0.0.0.0", "--port", "8080"]
