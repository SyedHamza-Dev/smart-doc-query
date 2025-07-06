# routes/document_routes.py

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import os
import shutil
import glob
from typing import List
from services.document_service import DocumentService
from services.chat_service import ChatService
from pydantic import BaseModel

router = APIRouter()
document_service = DocumentService()
chat_service = ChatService()

class UploadResponse(BaseModel):
    message: str
    filename: str
    status: str

@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload and process a single document"""
    
    # Check file type
    allowed_extensions = {'.pdf', '.txt', '.docx', '.md'}
    file_extension = os.path.splitext(file.filename)[1].lower()
    
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    
    try:
        # Save uploaded file
        upload_path = f"uploads/{file.filename}"
        with open(upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process the document
        success = await document_service.process_single_document(upload_path)
        
        if success:
            # Force refresh chat service vectorstore
            chat_service.reload_vectorstore()
            
            return UploadResponse(
                message="Document uploaded and processed successfully",
                filename=file.filename,
                status="success"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to process document")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@router.post("/upload-multiple")
async def upload_multiple_documents(files: List[UploadFile] = File(...)):
    """Upload and process multiple documents"""
    
    results = []
    allowed_extensions = {'.pdf', '.txt', '.docx', '.md'}
    
    for file in files:
        file_extension = os.path.splitext(file.filename)[1].lower()
        
        if file_extension not in allowed_extensions:
            results.append({
                "filename": file.filename,
                "status": "error",
                "message": f"Unsupported file type: {file_extension}"
            })
            continue
        
        try:
            # Save uploaded file
            upload_path = f"uploads/{file.filename}"
            with open(upload_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Process the document
            success = await document_service.process_single_document(upload_path)
            
            results.append({
                "filename": file.filename,
                "status": "success" if success else "error",
                "message": "Processed successfully" if success else "Processing failed"
            })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "message": f"Error: {str(e)}"
            })
    
    # Force refresh chat service vectorstore after processing all files
    try:
        chat_service.reload_vectorstore()
    except Exception as e:
        print(f"Warning: Failed to refresh vectorstore: {str(e)}")
    
    return {"results": results}

@router.get("/list")
async def list_uploaded_documents():
    """List all uploaded documents"""
    try:
        files = os.listdir("uploads")
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")

@router.delete("/delete/{filename}")
async def delete_document(filename: str):
    """Delete an uploaded document"""
    try:
        file_path = f"uploads/{filename}"
        if os.path.exists(file_path):
            os.remove(file_path)
            
            # Reprocess all remaining documents to update vectorstore
            await document_service.process_all_documents()
            chat_service.reload_vectorstore()
            
            return {"message": f"File {filename} deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@router.post("/reprocess")
async def reprocess_all_documents():
    """Reprocess all uploaded documents"""
    try:
        # Check if there are any documents to process
        if not os.path.exists("uploads"):
            return {"message": "No uploads directory found", "document_count": 0, "status": "no_documents"}
        
        # Count documents before processing
        supported_extensions = ['*.pdf', '*.txt', '*.docx', '*.md']
        document_files = []
        for extension in supported_extensions:
            files = glob.glob(os.path.join("uploads", extension))
            document_files.extend(files)
        
        if not document_files:
            return {
                "message": "No documents found to reprocess", 
                "document_count": 0,
                "status": "no_documents"
            }
        
        # Process documents
        success = await document_service.process_all_documents()
        
        if success:
            # Force refresh chat service vectorstore
            chat_service.reload_vectorstore()
            return {
                "message": f"Successfully reprocessed {len(document_files)} documents",
                "document_count": len(document_files),
                "files_processed": [os.path.basename(f) for f in document_files],
                "status": "success"
            }
        else:
            return {
                "message": "Failed to reprocess documents",
                "document_count": len(document_files),
                "status": "error"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reprocessing: {str(e)}")