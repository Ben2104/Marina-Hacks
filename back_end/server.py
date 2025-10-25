from fastapi import FastAPI, UploadFile, File
from utils import extract_event, parse_event
from pathlib import Path
import os

# try:
#     os.add_dll_directory(
#         r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin"
#     )
#     os.add_dll_directory(
#         r"C:\tools\cudnn\bin"
#     )  # folder that contains cudnn_ops64_9.dll
# except Exception as e:
#     print("Warning: add_dll_directory failed:", e)
# import asyncio

# from models.api import get_location
# from models.SpeechToText import SpeechToText

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
    # os.path.join(os.getcwd(), "audio", "audio.wav")
    dest = Path(os.path.join(os.getcwd(), "audio", "audio.wav"))

    #Stream to disk (efficient for large files)
    with dest.open("wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            f.write(chunk)

    event = extract_event(dest)
    parsed_event = parse_event(event)

    return parsed_event
