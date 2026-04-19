import PyPDF2
import os
import logging

logger = logging.getLogger("utils")

def extract_text_from_pdf(pdf_path):
    """Extracts text and page numbers from a PDF file."""
    logger.info(f"Opening PDF: {pdf_path}")
    text_content = []
    try:
        file_size = os.path.getsize(pdf_path)
        logger.info(f"PDF file size: {file_size} bytes")
        
        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            total_pages = len(reader.pages)
            logger.info(f"PDF has {total_pages} pages")
            
            for page_num in range(total_pages):
                page = reader.pages[page_num]
                text = page.extract_text()
                if text:
                    text_content.append({
                        "page": page_num + 1,
                        "text": text
                    })
                    logger.debug(f"Page {page_num + 1}: extracted {len(text)} chars")
                else:
                    logger.warning(f"Page {page_num + 1}: no text extracted (might be image-based)")
        
        total_chars = sum(len(item["text"]) for item in text_content)
        logger.info(f"Extraction complete: {len(text_content)}/{total_pages} pages with text, {total_chars} total chars")
        
    except Exception as e:
        logger.error(f"Error extracting PDF: {e}")
        import traceback
        logger.error(traceback.format_exc())
    return text_content

def chunk_text(text_data, chunk_size=1000, overlap=100):
    """Splits extracted text into chunks with metadata."""
    logger.info(f"Chunking {len(text_data)} pages (chunk_size={chunk_size}, overlap={overlap})")
    chunks = []
    for item in text_data:
        text = item["text"]
        page = item["page"]
        
        # Simple character-based chunking for demo
        # For more precision, use token-based chunking
        start = 0
        page_chunks = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append({
                "content": chunk,
                "metadata": {"page": page}
            })
            page_chunks += 1
            start += chunk_size - overlap
        logger.debug(f"Page {page}: created {page_chunks} chunks")
    
    logger.info(f"Chunking complete: {len(chunks)} total chunks")
    return chunks
