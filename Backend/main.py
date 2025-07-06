from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from routes.document_routes import router as document_router
from routes.chat_routes import router as chat_router
import os

app = FastAPI(title="Document Chat API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(document_router, prefix="/api/documents", tags=["documents"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])

@app.get("/")
async def root():
    return {"message": "Document Chat API is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    # Create necessary directories
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("vectorstore", exist_ok=True)
    
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)