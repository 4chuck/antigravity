import chromadb
import google.generativeai as genai
from chromadb.utils import embedding_functions
import os
import logging

logger = logging.getLogger("rag_pipeline")

class RAGPipeline:
    def __init__(self, collection_name="document_collection"):
        # Initialize the Google Gemini embedding function
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEY not found in environment!")
            raise ValueError("GEMINI_API_KEY is required for RAG pipeline.")
            
        logger.info("Initializing Google Gemini embedding function...")
        self.embedding_function = embedding_functions.GoogleGenerativeAIEmbeddingFunction(
            api_key=api_key,
            task_type="RETRIEVAL_DOCUMENT"
        )
        
        # Initialize ChromaDB client (persistent storage)
        db_path = os.path.abspath("./chroma_db")
        logger.info(f"Initializing ChromaDB at: {db_path}")
        self.client = chromadb.PersistentClient(path="./chroma_db")
        
        # Create or get collection with the embedding function
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_function,
            metadata={"hnsw:space": "cosine"}
        )
        doc_count = self.collection.count()
        logger.info(f"ChromaDB collection '{collection_name}' ready. Existing docs: {doc_count}")

    def add_documents(self, chunks):
        """Adds chunks to the vector database."""
        logger.info(f"Adding {len(chunks)} chunks to vector DB...")
        documents = [c["content"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]
        ids = [f"id_{i}" for i in range(len(chunks))]
        
        # Chroma handles embeddings automatically when embedding_function is provided to get_or_create_collection
        try:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            new_count = self.collection.count()
            logger.info(f"Chunks added successfully. Total docs in collection: {new_count}")
        except Exception as e:
            logger.error(f"Error adding documents to ChromaDB: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def query(self, query_text, n_results=5):
        """Retrieves top-k relevant chunks."""
        logger.info(f"Querying vector DB: '{query_text[:60]}' (n_results={n_results})")
        
        try:
            # Chroma handles embeddings automatically
            results = self.collection.query(
                query_texts=[query_text],
                n_results=n_results
            )
            
            num_results = len(results['documents'][0]) if results['documents'] else 0
            logger.info(f"Query returned {num_results} results")
            
            if num_results > 0:
                logger.debug(f"Top result preview: {results['documents'][0][0][:100]}...")
            
            return results
        except Exception as e:
            logger.error(f"Error querying ChromaDB: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise

    def clear_collection(self):
        """Web demo: clear collection for new uploads."""
        logger.warning("Clearing entire collection!")
        try:
            self.client.delete_collection(self.collection.name)
            self.collection = self.client.get_or_create_collection(name=self.collection.name)
            logger.info("Collection cleared and recreated.")
        except Exception as e:
            logger.error(f"Error clearing collection: {e}")
