from fastapi import FastAPI, UploadFile, File, 
from utils import extract_event, parse_event
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
    dest = Path("./audio/audio.wav")

    # Stream to disk (efficient for large files)
    with dest.open("wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)

    text = await asyncio.to_thread(model.transcribe, str(dest))
    return {"transcript": text}


@app.post("/location")
async def get_event(file: UploadFile = File(...)):
    dest = Path(
        r"C:\Users\syngu\Downloads\CSULB\MarinaHack\Marina-Hacks\back_end\audio\audio.wav"
    )

    event = extract_event(dest) 
    parsed_event = parse_event(event)
    
    return parsed_event
