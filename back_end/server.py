from fastapi import FastAPI, UploadFile, File, HTTPException
from utils import extract_event, parse_event
from pathlib import Path
import os, time, io

app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "Hello, you have successfully contact OUR API"}


# @app.post("/transcribe")
# async def transcribe(file: UploadFile = File(...)):
#     model = SpeechToText()
#     dest = Path("./audio/audio.wav")

#     # Stream to disk (efficient for large files)
#     with dest.open("wb") as f:
#         while chunk := await file.read(1024 * 1024):  # 1 MB chunks
#             f.write(chunk)

#     text = await asyncio.to_thread(model.transcribe, str(dest))
#     return {"transcript": text}


@app.post("/location")
async def get_event(file: UploadFile = File(...)):
    start = int(time.time())

    data = await file.read()
    audio_bytes = io.BytesIO(data)

    event = extract_event(audio_bytes)
    parsed_event = parse_event(event)
    end = int(time.time())

    if parsed_event:
        parsed_event['Response_time']= end-start
    else:
        raise HTTPException(404, detail="ERROR: Location not found.")
    
    return parsed_event
