# 🧠 Smart Doc Query

A simple document-based question-answering system using **LangChain**, **Mistral AI**, **FAISS** as the vector database, and a modern frontend built with **Next.js**.

---

## Backend Dependencies


## ⚙️ Backend Setup
pipenv install huggingface-hub==0.27.0 langchain==0.3.12 langchain-community==0.3.12 langchain-core==0.3.63 langchain-huggingface==0.1.2 langchain-text-splitters==0.3.8
pipenv install pypdf faiss-cpu streamlit


Set up your Python backend using `pipenv` as your environment manager.

### 🔧 Step-by-Step Instructions

1. **Activate pipenv shell**

   ```bash
   pipenv shell

2. Manually activate virtual environment
   .\.venv\Scripts\Activate.ps1

3. Run backend services
   python main.py shell
   uvicorn main:app --reload --host 0.0.0.0 --port 8000

   Add your Hugging Face API key and any other secrets to the .env file.

### Frontend Setup
npm install
npm run dev

