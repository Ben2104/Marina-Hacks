import torch
from faster_whisper import WhisperModel

class SpeechToText:
    def __init__(self, model_size:str="medium.en", compute_type:str="float32") -> None:
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = WhisperModel(model_size, device=self.device, compute_type=compute_type)


    def transcribe(self, audio_path:str):
        segments, info = self.model.transcribe(audio_path)
        text = "".join(segment.text for segment in segments)
        return text
     
