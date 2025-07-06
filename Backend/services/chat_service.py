# Services/chat_service.py

import os
from langchain_huggingface import HuggingFaceEndpoint
from langchain_core.prompts import PromptTemplate
from langchain.chains import RetrievalQA
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self, vectorstore_path="vectorstore/db_faiss"):
        self.vectorstore_path = vectorstore_path
        self.embedding_model = None
        self.vectorstore = None
        self.qa_chain = None
        self.llm = None
        self._vectorstore_last_modified = None
        
        # HuggingFace configuration
        self.hf_token = os.environ.get("HF_TOKEN")
        self.huggingface_repo_id = "mistralai/Mistral-7B-Instruct-v0.3"
        
        # Custom prompt template
        self.custom_prompt_template = """
        Use the pieces of information provided in the context to answer user's question.
        If you don't know the answer, just say that you don't know. Don't try to make up an answer.
        Don't provide anything out of the given context.

        Context: {context}
        Question: {question}

        Start the answer directly. No small talk please.
        """
    
    def get_embedding_model(self):
        """Initialize embedding model"""
        if self.embedding_model is None:
            logger.info("Loading embedding model...")
            self.embedding_model = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
        return self.embedding_model
    
    def load_llm(self):
        """Load HuggingFace LLM"""
        if self.llm is None:
            logger.info("Loading LLM...")
            self.llm = HuggingFaceEndpoint(
                repo_id=self.huggingface_repo_id,
                temperature=0.5,
                model_kwargs={"token": self.hf_token, "max_length": "512"}
            )
        return self.llm
    
    def set_custom_prompt(self):
        """Set custom prompt template"""
        return PromptTemplate(
            template=self.custom_prompt_template, 
            input_variables=["context", "question"]
        )
    
    def _check_vectorstore_modified(self):
        """Check if vectorstore has been modified"""
        try:
            if not os.path.exists(self.vectorstore_path):
                return True
            
            # Get modification time of vectorstore directory
            current_modified = os.path.getmtime(self.vectorstore_path)
            
            if self._vectorstore_last_modified is None or current_modified > self._vectorstore_last_modified:
                self._vectorstore_last_modified = current_modified
                return True
                
            return False
        except Exception as e:
            logger.error(f"Error checking vectorstore modification: {str(e)}")
            return True
    
    def load_vectorstore(self, force_reload=False):
        """Load FAISS vectorstore with automatic reload detection"""
        # Check if vectorstore needs reloading
        needs_reload = force_reload or self.vectorstore is None or self._check_vectorstore_modified()
        
        if needs_reload:
            if not os.path.exists(self.vectorstore_path):
                logger.error(f"Vectorstore not found at {self.vectorstore_path}")
                return None
            
            try:
                embedding_model = self.get_embedding_model()
                self.vectorstore = FAISS.load_local(
                    self.vectorstore_path, 
                    embedding_model, 
                    allow_dangerous_deserialization=True
                )
                # Reset QA chain when vectorstore is reloaded
                self.qa_chain = None
                logger.info("Vectorstore reloaded successfully")
            except Exception as e:
                logger.error(f"Error loading vectorstore: {str(e)}")
                return None
        
        return self.vectorstore
    
    def initialize_qa_chain(self):
        """Initialize QA chain with fresh vectorstore"""
        # Always reload vectorstore to get latest documents
        vectorstore = self.load_vectorstore()
        if vectorstore is None:
            return None
        
        # Reinitialize QA chain if vectorstore was reloaded or chain doesn't exist
        if self.qa_chain is None:
            try:
                llm = self.load_llm()
                prompt = self.set_custom_prompt()
                
                self.qa_chain = RetrievalQA.from_chain_type(
                    llm=llm,
                    chain_type="stuff",
                    retriever=vectorstore.as_retriever(search_kwargs={'k': 3}),
                    return_source_documents=True,
                    chain_type_kwargs={'prompt': prompt}
                )
                logger.info("QA chain initialized successfully")
            except Exception as e:
                logger.error(f"Error initializing QA chain: {str(e)}")
                return None
        
        return self.qa_chain
    
    async def get_response(self, query: str):
        """Get response for user query with fresh vectorstore"""
        try:
            qa_chain = self.initialize_qa_chain()
            if qa_chain is None:
                raise Exception("QA chain not initialized")
            
            logger.info(f"Processing query: {query}")
            response = qa_chain.invoke({'query': query})
            
            # Extract source documents
            source_docs = []
            if 'source_documents' in response:
                for doc in response['source_documents']:
                    # Get document metadata and content preview
                    content_preview = doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content
                    source_info = {
                        "content": content_preview,
                        "metadata": doc.metadata
                    }
                    source_docs.append(str(source_info))
            
            return {
                "answer": response.get("result", "No answer found"),
                "source_docs": source_docs
            }
            
        except Exception as e:
            logger.error(f"Error getting response: {str(e)}")
            raise Exception(f"Error processing query: {str(e)}")
    
    def is_vectorstore_available(self):
        """Check if vectorstore is available"""
        try:
            vectorstore = self.load_vectorstore()
            return vectorstore is not None
        except Exception as e:
            logger.error(f"Error checking vectorstore availability: {str(e)}")
            return False
    
    def get_document_count(self):
        """Get actual document count from vectorstore"""
        try:
            vectorstore = self.load_vectorstore(force_reload=True)
            if vectorstore is None:
                return 0
            
            # Get the actual count from FAISS index
            if hasattr(vectorstore, 'docstore') and hasattr(vectorstore.docstore, '_dict'):
                return vectorstore.index.ntotal
            else:
                # Alternative method to count documents
                try:
                    # Get a sample retrieval to check if documents exist
                    retriever = vectorstore.as_retriever(search_kwargs={'k': 1})
                    test_docs = retriever.get_relevant_documents("test")
                    return len(vectorstore.docstore._dict) if hasattr(vectorstore, 'docstore') else 1
                except:
                    return 0
                
        except Exception as e:
            logger.error(f"Error getting document count: {str(e)}")
            return 0
    
    def health_check(self):
        """Check if chat service is healthy"""
        try:
            # Check if HF token is available
            if not self.hf_token:
                logger.error("HF_TOKEN not found in environment variables")
                return False
            
            # Check if vectorstore is available
            if not self.is_vectorstore_available():
                logger.warning("Vectorstore not available")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return False
    
    def reload_vectorstore(self):
        """Force reload vectorstore (useful after new documents are added)"""
        self.vectorstore = None
        self.qa_chain = None
        self._vectorstore_last_modified = None
        logger.info("Vectorstore and QA chain reset for reload")
        # Force reload
        self.load_vectorstore(force_reload=True)