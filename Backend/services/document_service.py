# Services/document_service.py

import os
import glob
from langchain_community.document_loaders import (
    PyPDFLoader, 
    DirectoryLoader, 
    TextLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredMarkdownLoader
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from typing import List
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DocumentService:
    def __init__(self, upload_path="uploads/", vectorstore_path="vectorstore/db_faiss"):
        self.upload_path = upload_path
        self.vectorstore_path = vectorstore_path
        self.embedding_model = None
        
    def get_embedding_model(self):
        """Initialize embedding model"""
        if self.embedding_model is None:
            logger.info("Loading embedding model...")
            self.embedding_model = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
        return self.embedding_model
    
    def load_single_document(self, file_path: str):
        """Load a single document based on its extension"""
        documents = []
        file_extension = os.path.splitext(file_path)[1].lower()
        
        try:
            if file_extension == '.pdf':
                loader = PyPDFLoader(file_path)
                documents = loader.load()
            elif file_extension == '.txt':
                loader = TextLoader(file_path)
                documents = loader.load()
            elif file_extension == '.docx':
                loader = UnstructuredWordDocumentLoader(file_path)
                documents = loader.load()
            elif file_extension == '.md':
                loader = UnstructuredMarkdownLoader(file_path)
                documents = loader.load()
            else:
                logger.error(f"Unsupported file type: {file_extension}")
                return []
                
            logger.info(f"Loaded {len(documents)} documents from {file_path}")
            return documents
            
        except Exception as e:
            logger.error(f"Error loading document {file_path}: {str(e)}")
            return []
    
    def load_all_documents_from_uploads(self):
        """Load all documents from uploads directory"""
        all_documents = []
        
        if not os.path.exists(self.upload_path):
            logger.warning(f"Upload directory '{self.upload_path}' not found!")
            return []
        
        # Get all supported files
        supported_extensions = ['*.pdf', '*.txt', '*.docx', '*.md']
        
        for extension in supported_extensions:
            files = glob.glob(os.path.join(self.upload_path, extension))
            for file_path in files:
                docs = self.load_single_document(file_path)
                all_documents.extend(docs)
        
        logger.info(f"Total documents loaded: {len(all_documents)}")
        return all_documents
    
    def create_chunks(self, documents, chunk_size=800, chunk_overlap=100):
        """Create text chunks from documents"""
        logger.info(f"Creating text chunks (size: {chunk_size}, overlap: {chunk_overlap})...")
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        
        text_chunks = text_splitter.split_documents(documents)
        logger.info(f"Created {len(text_chunks)} text chunks")
        return text_chunks
    
    def create_or_update_vectorstore(self, text_chunks):
        """Create or update FAISS vectorstore"""
        logger.info("Creating/updating vector embeddings...")
        
        embedding_model = self.get_embedding_model()
        
        # Check if vectorstore already exists
        if os.path.exists(self.vectorstore_path):
            try:
                # Load existing vectorstore
                logger.info("Loading existing vectorstore...")
                existing_db = FAISS.load_local(self.vectorstore_path, embedding_model, allow_dangerous_deserialization=True)
                
                # Create new vectorstore from new chunks
                new_db = FAISS.from_documents(text_chunks, embedding_model)
                
                # Merge vectorstores
                logger.info("Merging with existing vectorstore...")
                existing_db.merge_from(new_db)
                
                # Save updated vectorstore
                existing_db.save_local(self.vectorstore_path)
                logger.info("Vectorstore updated successfully!")
                
                return True
                
            except Exception as e:
                logger.error(f"Error updating existing vectorstore: {str(e)}")
                # Fall back to creating new vectorstore
        
        # Create new vectorstore
        logger.info("Creating new vectorstore...")
        db = FAISS.from_documents(text_chunks, embedding_model)
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(self.vectorstore_path), exist_ok=True)
        
        # Save vectorstore
        db.save_local(self.vectorstore_path)
        logger.info("New vectorstore created successfully!")
        
        return True
    
    async def process_single_document(self, file_path: str):
        """Process a single uploaded document"""
        try:
            # Load the document
            documents = self.load_single_document(file_path)
            
            if not documents:
                logger.error("No documents loaded")
                return False
            
            # Create chunks
            text_chunks = self.create_chunks(documents)
            
            if not text_chunks:
                logger.error("No text chunks created")
                return False
            
            # Create/update vectorstore
            success = self.create_or_update_vectorstore(text_chunks)
            
            logger.info(f"Document {file_path} processed successfully!")
            return success
            
        except Exception as e:
            logger.error(f"Error processing document {file_path}: {str(e)}")
            return False
    
    async def process_all_documents(self):
        """Process all documents in uploads directory"""
        try:
            # Load all documents
            documents = self.load_all_documents_from_uploads()
            
            if not documents:
                logger.error("No documents found to process")
                return False
            
            # Create chunks
            text_chunks = self.create_chunks(documents)
            
            if not text_chunks:
                logger.error("No text chunks created")
                return False
            
            # Create fresh vectorstore (replace existing)
            logger.info("Creating fresh vectorstore from all documents...")
            embedding_model = self.get_embedding_model()
            db = FAISS.from_documents(text_chunks, embedding_model)
            
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(self.vectorstore_path), exist_ok=True)
            
            # Save vectorstore
            db.save_local(self.vectorstore_path)
            
            logger.info(f"All documents processed successfully! Total chunks: {len(text_chunks)}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing all documents: {str(e)}")
            return False
    
    def get_vectorstore_status(self):
        """Check if vectorstore exists and get basic info"""
        if os.path.exists(self.vectorstore_path):
            try:
                embedding_model = self.get_embedding_model()
                db = FAISS.load_local(self.vectorstore_path, embedding_model, allow_dangerous_deserialization=True)
                return {
                    "exists": True,
                    "document_count": db.index.ntotal if hasattr(db.index, 'ntotal') else "Unknown"
                }
            except Exception as e:
                logger.error(f"Error checking vectorstore: {str(e)}")
                return {"exists": False, "error": str(e)}
        
        return {"exists": False}