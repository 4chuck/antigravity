import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer
import os
import logging

logger = logging.getLogger("rag_pipeline")

class RAGPipeline:
    def __init__(self, collection_name="document_collection"):
        # Initialize the embedding function
        logger.info("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Embedding model loaded.")
        
        # Initialize ChromaDB client (persistent storage)
        db_path = os.path.abspath("./chroma_db")
        logger.info(f"Initializing ChromaDB at: {db_path}")
        self.client = chromadb.PersistentClient(path="./chroma_db")
        
        # Create or get collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
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
        
        logger.debug(f"Generating embeddings for {len(documents)} documents...")
        embeddings = self.embedding_model.encode(documents).tolist()
        logger.debug(f"Embeddings generated. Shape: {len(embeddings)}x{len(embeddings[0]) if embeddings else 0}")
        
        try:
            self.collection.add(
                embeddings=embeddings,
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
            query_embeddings = self.embedding_model.encode([query_text]).tolist()
            logger.debug(f"Query embedding generated (dim={len(query_embeddings[0])})")
            
            results = self.collection.query(
                query_embeddings=query_embeddings,
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
