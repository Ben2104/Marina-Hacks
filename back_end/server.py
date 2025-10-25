from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
import asyncio

from models.api import get_location
from models.SpeechToText import SpeechToText

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, you have successfully contact OUR API"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    model = SpeechToText()
    dest = Path("./audio/temp_audio.mp3")

    # Stream to disk (efficient for large files)
    with dest.open("wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)
    
    text = await asyncio.to_thread(model.transcribe, str(dest))
    return {"transcript":text}

    
@app.post("/location")
async def location(file: UploadFile = File(...)):
    model = SpeechToText()
    dest = Path("./audio/temp_audio.mp3")

    # Stream to disk (efficient for large files)
    with dest.open("wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)
    
    text = await asyncio.to_thread(model.transcribe, str(dest))
    return get_location(text)