import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("EMBEDDER_PORT", "8003"))
    uvicorn.run("services.embedder.main:app", host="0.0.0.0", port=port, log_level="warning")
