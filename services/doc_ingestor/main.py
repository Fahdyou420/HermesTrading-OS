import os
import sys
import time
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

# Ensure correct python path for shared modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import redis
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Optional fitzimport safely
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

# Shared logger
from services.shared.logger import get_logger

logger = get_logger("doc_ingestor")

# Configurations
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
INBOX_DIR = Path("/data/documents/inbox")
PROCESSED_DIR = Path("/data/documents/processed")
QUEUE_NAME = "doc_chunks_queue"

# Create directories if they do not exist
INBOX_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def split_text_into_chunks(text: str, chunk_size_tokens: int = 512, overlap_tokens: int = 64) -> List[str]:
    """
    Split text into chunks based on word count (1 token ≈ 0.75 words).
    512 tokens ≈ 384 words.
    64 tokens overlap ≈ 48 words.
    """
    words = text.split()
    if not words:
        return []

    chunk_size = int(chunk_size_tokens * 0.75) or 384
    overlap = int(overlap_tokens * 0.75) or 48

    if overlap >= chunk_size:
        overlap = chunk_size - 1

    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
        i += (chunk_size - overlap)

    return chunks


def detect_instrument(filename: str, peek_text: str) -> str:
    """Detect instrument hints inside file name or early contents."""
    combined = f"{filename} {peek_text[:200]}".lower()
    if "gold" in combined or "xauusd" in combined or "xau" in combined:
        return "XAUUSD"
    elif "eurusd" in combined or "eur" in combined:
        return "EURUSD"
    elif "gbp" in combined or "gbpusd" in combined or "cable" in combined:
        return "GBPUSD"
    elif "jpy" in combined or "usdjpy" in combined:
        return "USDJPY"
    return "GLOBAL"


class DocumentHandler(FileSystemEventHandler):
    def __init__(self, r_client: redis.Redis):
        self.redis = r_client

    def on_created(self, event):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        # Avoid temporary files or folders
        if file_path.name.startswith(".") or file_path.name.startswith("~"):
            return

        logger.info(f"Detected new document in inbox: {file_path.name}")
        # Wait a small moment to ensure the file is completely written on slow systems
        time.sleep(1.0)
        
        self.process_file(file_path)

    def process_file(self, file_path: Path):
        ext = file_path.suffix.lower()
        if ext not in [".pdf", ".txt", ".md"]:
            logger.warning(f"Skipping unsupported file type: {file_path.name}")
            return

        logger.info(f"Ingesting file: {file_path.name}")
        text = ""

        try:
            if ext == ".pdf":
                if fitz is None:
                    raise ImportError("PyMuPDF (fitz) is not installed in the environment!")
                doc = fitz.open(file_path)
                pages_text = []
                for page in doc:
                    pages_text.append(page.get_text())
                text = "\n".join(pages_text)
                doc.close()
            else:  # .txt or .md
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()

            text = text.strip()
            if not text:
                logger.warning(f"File {file_path.name} extracted text is empty.")
                self.move_to_processed(file_path)
                return

            # Analyze instrument hint
            instrument_hint = detect_instrument(file_path.name, text[:200])

            # Process into chunks
            chunks = split_text_into_chunks(text)
            total_chunks = len(chunks)
            logger.info(f"Split {file_path.name} into {total_chunks} chunk(s) (Instrument hint: {instrument_hint})")

            date_str = datetime.utcnow().isoformat() + "Z"

            for i, chunk_text in enumerate(chunks):
                chunk_payload = {
                    "text": chunk_text,
                    "source_file": file_path.name,
                    "chunk_index": i,
                    "total_chunks": total_chunks,
                    "doc_type": ext[1:],  # pdf, txt, md
                    "instrument_hint": instrument_hint,
                    "date_ingested": date_str
                }
                
                # Push JSON content to the Redis queue
                self.redis.rpush(QUEUE_NAME, json.dumps(chunk_payload))
                logger.info(f"Pushed chunk {i+1}/{total_chunks} for {file_path.name} to Redis queue.")

            # File processed successfully, move it
            self.move_to_processed(file_path)

        except Exception as e:
            logger.error(f"Error processing document {file_path.name}: {e}", exc_info=True)

    def move_to_processed(self, file_path: Path):
        dest = PROCESSED_DIR / file_path.name
        try:
            # Overwrite if exists to prevent duplication roadblocks
            if dest.exists():
                dest.unlink()
            shutil.move(str(file_path), str(dest))
            logger.info(f"Moved {file_path.name} to processed folder.")
        except Exception as e:
            logger.error(f"Failed to move document to processed folder: {e}")


def main():
    logger.info("Initializing Hermes Knowledge Document Ingestor...")
    logger.info(f"Connecting to Redis at {REDIS_URL}...")
    
    r_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        r_client.ping()
        logger.info("[✓] Connected to Redis successfully.")
    except Exception as e:
        logger.critical(f"[X] Failed to connect to Redis: {e}")
        sys.exit(1)

    # Process outstanding files currently in the inbox before setting up active watchdog
    logger.info(f"Scanning inbox directory '{INBOX_DIR}' for existing files...")
    handler = DocumentHandler(r_client)
    for existing_file in INBOX_DIR.glob("*"):
        if existing_file.is_file() and not existing_file.name.startswith("."):
            handler.process_file(existing_file)

    # Initialize Watcher observer
    observer = Observer()
    observer.schedule(handler, path=str(INBOX_DIR), recursive=False)
    observer.start()
    logger.info(f"[✓] Document Watcher started. Active listening directory: {INBOX_DIR}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down watchdog observer process...")
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
