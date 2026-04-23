from fastapi import FastAPI, UploadFile, File, Form, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import shutil
import logging
import traceback
import json

from backend.utils import extract_text_from_pdf, chunk_text
from backend.rag_pipeline import RAGPipeline
from backend.agent import AIAgent

# ============================================
# Logging Setup
# ============================================
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("main")

app = FastAPI(title="NotebookLM Clone API")

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For demo purposes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipelines
logger.info("Initializing RAG pipeline...")
rag = RAGPipeline()
logger.info("RAG pipeline ready.")

logger.info("Initializing AI Agent...")
agent = AIAgent()
logger.info("AI Agent ready.")

# Track uploaded documents
uploaded_docs = []

# Temporary upload folder
UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --------------------------------------------
# API Router
# --------------------------------------------
api_router = APIRouter()

class QueryRequest(BaseModel):
    query: str
    mode: str = "qa"  # qa | quiz | simplify | agent
    options: dict = {}

@api_router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    logger.info(f"=== UPLOAD REQUEST: {file.filename} ===")
    
    if not file.filename.endswith('.pdf'):
        logger.warning(f"Rejected non-PDF file: {file.filename}")
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"File saved to {file_path}")
            
        # Extract text
        logger.info(f"Extracting text from {file.filename}...")
        text_data = extract_text_from_pdf(file_path)
        logger.info(f"Extracted {len(text_data)} pages of text")
        
        if not text_data:
            logger.error("No text extracted from PDF!")
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")
            
        # Chunk text
        logger.info("Chunking text...")
        chunks = chunk_text(text_data)
        logger.info(f"Created {len(chunks)} chunks")
        
        # Add source metadata
        for chunk in chunks:
            chunk["metadata"]["source"] = file.filename
            
        # Add to vector DB
        logger.info(f"Adding {len(chunks)} chunks to vector DB...")
        rag.add_documents(chunks)
        logger.info("Chunks added to vector DB successfully")
        
        # Track file
        if file.filename not in uploaded_docs:
            uploaded_docs.append(file.filename)
        
        # Cleanup temp file
        os.remove(file_path)
        logger.info(f"=== UPLOAD COMPLETE: {file.filename} | Total docs: {len(uploaded_docs)} ===")
        
        return {
            "status": "success", 
            "message": f"Successfully processed {file.filename}.",
            "files": uploaded_docs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"UPLOAD ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.post("/query")
async def process_query(request: QueryRequest):
    query = request.query
    mode = request.mode
    
    logger.info(f"=== QUERY REQUEST | mode={mode} | query='{query[:80]}...' ===")
    
    try:
        # 1. Retrieve context chunks from Vector DB
        logger.debug(f"Searching vector DB for: '{query[:50]}'")
        results = rag.query(query, n_results=5)
        
        context_chunks = results['documents'][0] if results['documents'] else []
        logger.info(f"Retrieved {len(context_chunks)} context chunks")
        
        context = "\n\n".join(context_chunks)
        
        if not context:
            logger.warning("No context found for query")
            return {"response": "I couldn't find relevant information in the uploaded PDF. Please try a different query."}
        
        logger.debug(f"Context length: {len(context)} chars")
            
        # 2. Route to appropriate agent function based on mode
        logger.info(f"Routing to agent mode: {mode}")
        response = ""
        if mode == "qa":
            response = agent.ask_question(query, context)
        elif mode == "quiz":
            num_q = request.options.get("num_questions", 5)
            logger.info(f"Generating quiz with {num_q} questions")
            response = agent.generate_quiz(context, num_questions=num_q)
        elif mode == "simplify":
            response = agent.explain_simply(context)
        elif mode == "agent":
            response = agent.handle_agent_task(query, context)
        else:
            logger.warning(f"Unknown mode '{mode}', falling back to qa")
            response = agent.ask_question(query, context)
        
        logger.info(f"Agent response length: {len(response)} chars")
        logger.debug(f"Response preview: {response[:200]}...")
            
        sources = [{"content": doc, "metadata": meta} for doc, meta in zip(results['documents'][0], results['metadatas'][0])]
        logger.info(f"=== QUERY COMPLETE | {len(sources)} sources attached ===")
        
        return {
            "status": "success", 
            "response": response,
            "sources": sources
        }
        
    except Exception as e:
        logger.error(f"QUERY ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/sources")
async def get_sources():
    logger.debug(f"Sources requested. Current docs: {uploaded_docs}")
    return {"files": uploaded_docs}

@api_router.post("/generate-audio-overview")
async def generate_audio_overview():
    logger.info("=== AUDIO OVERVIEW REQUEST ===")
    try:
        # Pull a broad sample of context for the overview
        results = rag.query("Main topics and key concepts", n_results=10)
        context_chunks = results['documents'][0] if results['documents'] else []
        context = "\n\n".join(context_chunks)
        
        logger.info(f"Audio context: {len(context_chunks)} chunks, {len(context)} chars")
        
        if not context:
            logger.error("No context found for audio overview")
            raise HTTPException(status_code=400, detail="No document context found. Please upload a PDF first.")
            
        logger.info("Generating podcast script via AI agent...")
        script_raw = agent.generate_podcast_script(context)
        logger.debug(f"Raw script response: {script_raw[:300]}...")
        
        # Clean JSON
        json_str = script_raw.strip()
        if json_str.startswith("```json"):
            json_str = json_str.replace("```json", "").replace("```", "").strip()
        elif json_str.startswith("```"):
            json_str = json_str.replace("```", "").strip()
        
        logger.debug(f"Cleaned JSON (first 200 chars): {json_str[:200]}")
        
        script = json.loads(json_str)
        logger.info(f"=== AUDIO OVERVIEW COMPLETE | {len(script)} dialogue lines ===")
        return {"status": "success", "script": script}
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON PARSE ERROR: {str(e)}")
        logger.error(f"Attempted to parse: {json_str[:500]}")
        raise HTTPException(status_code=500, detail=f"Failed to parse podcast script: {str(e)}")
    except Exception as e:
        logger.error(f"AUDIO OVERVIEW ERROR: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/health")
def health_check():
    return {"status": "ok"}

# --------------------------------------------
# App Configuration
# --------------------------------------------
app.include_router(api_router, prefix="/api")

# Serve the frontend
frontend_path = os.path.abspath(os.path.join(os.getcwd(), "frontend"))
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    logger.error(f"Frontend directory not found at {frontend_path}")
