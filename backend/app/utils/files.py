import os
from fastapi import UploadFile
from datetime import datetime
import uuid

async def save_uploaded_file(file: UploadFile, drug_name: str, upload_dir: str) -> str:
    # Create upload directory if it doesn't exist
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:6]
    safe_drug_name = "".join(c if c.isalnum() else "_" for c in drug_name)
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{safe_drug_name}_{timestamp}_{unique_id}{file_ext}"
    
    # Save file
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    # Return relative path or URL (adjust based on your needs)
    return f"/{upload_dir}/{filename}"