FROM python:3.11-slim

WORKDIR /app
COPY . .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run your app
CMD ["python", "run.py"]