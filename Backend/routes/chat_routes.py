# routes/chat_routes.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.chat_service import ChatService
from typing import List, Optional
import uuid
from datetime import datetime

router = APIRouter()
chat_service = ChatService()

# In-memory storage for current session
chat_sessions = {}

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    source_documents: List[str]
    status: str
    session_id: str

class ChatSession(BaseModel):
    id: str
    title: str
    messages: List[ChatMessage]
    created_at: str
    last_updated: str

class NewSessionRequest(BaseModel):
    title: Optional[str] = None

@router.post("/query", response_model=ChatResponse)
async def chat_query(request: ChatRequest):
    """Process chat query and return response"""
    
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    try:
        # Check if vectorstore exists
        if not chat_service.is_vectorstore_available():
            raise HTTPException(
                status_code=404, 
                detail="No documents found. Please upload documents first."
            )
        
        # Get or create session
        session_id = request.session_id or str(uuid.uuid4())
        current_time = datetime.now().isoformat()
        
        if session_id not in chat_sessions:
            # Create new session with title from first message (limit to 50 chars)
            title = request.message[:50] + "..." if len(request.message) > 50 else request.message
            chat_sessions[session_id] = {
                "id": session_id,
                "title": title,
                "messages": [],
                "created_at": current_time,
                "last_updated": current_time
            }
        else:
            # Update title if this is the first message in an existing "New Chat" session
            if chat_sessions[session_id]["title"] == "New Chat" and len(chat_sessions[session_id]["messages"]) == 0:
                title = request.message[:50] + "..." if len(request.message) > 50 else request.message
                chat_sessions[session_id]["title"] = title
        
        # Add user message to session
        user_message = ChatMessage(
            role="user", 
            content=request.message,
            timestamp=current_time
        )
        chat_sessions[session_id]["messages"].append(user_message.dict())
        
        # Get response from chat service
        result = await chat_service.get_response(request.message)
        
        # Add assistant message to session
        assistant_message = ChatMessage(
            role="assistant", 
            content=result["answer"],
            timestamp=datetime.now().isoformat()
        )
        chat_sessions[session_id]["messages"].append(assistant_message.dict())
        chat_sessions[session_id]["last_updated"] = datetime.now().isoformat()
        
        return ChatResponse(
            response=result["answer"],
            source_documents=result["source_docs"],
            status="success",
            session_id=session_id
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")

@router.post("/new-session")
async def create_new_session(request: NewSessionRequest):
    """Create a new chat session"""
    try:
        session_id = str(uuid.uuid4())
        current_time = datetime.now().isoformat()
        
        chat_sessions[session_id] = {
            "id": session_id,
            "title": request.title or "New Chat",
            "messages": [],
            "created_at": current_time,
            "last_updated": current_time
        }
        
        return {
            "session_id": session_id,
            "title": chat_sessions[session_id]["title"],
            "status": "success"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating new session: {str(e)}")

@router.post("/refresh-vectorstore")
async def refresh_vectorstore():
    """Refresh vectorstore to include newly uploaded documents"""
    try:
        chat_service.reload_vectorstore()
        return {"message": "Vectorstore refreshed successfully", "status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error refreshing vectorstore: {str(e)}")

@router.get("/status")
async def get_chat_status():
    """Get chat system status"""
    try:
        vectorstore_available = chat_service.is_vectorstore_available()
        document_count = chat_service.get_document_count()
        
        # Return proper document count instead of always showing 3
        actual_count = document_count if isinstance(document_count, int) else 0
        
        return {
            "vectorstore_available": vectorstore_available,
            "document_count": actual_count,
            "status": "ready" if vectorstore_available else "waiting_for_documents"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting status: {str(e)}")

@router.get("/sessions")
async def get_chat_sessions():
    """Get all chat sessions for current session"""
    try:
        sessions = []
        for session_id, session_data in chat_sessions.items():
            sessions.append({
                "id": session_data["id"],
                "title": session_data["title"],
                "created_at": session_data["created_at"],
                "last_updated": session_data["last_updated"],
                "message_count": len(session_data["messages"])
            })
        
        # Sort by last updated (newest first)
        sessions.sort(key=lambda x: x["last_updated"], reverse=True)
        return {"sessions": sessions}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sessions: {str(e)}")

@router.get("/sessions/{session_id}")
async def get_chat_session(session_id: str):
    """Get specific chat session"""
    try:
        if session_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return chat_sessions[session_id]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting session: {str(e)}")

@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    """Delete specific chat session"""
    try:
        if session_id not in chat_sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        del chat_sessions[session_id]
        return {"message": "Session deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")

@router.post("/clear-history")
async def clear_chat_history():
    """Clear all chat history"""
    try:
        chat_sessions.clear()
        return {"message": "Chat history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")

@router.get("/health")
async def chat_health():
    """Check chat service health"""
    try:
        health_status = chat_service.health_check()
        return {"status": "healthy" if health_status else "unhealthy"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}