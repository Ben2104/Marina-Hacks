import wave
import pyaudio
from faster_whisper import WhisperModel
import os
import threading
import sys
import tty

from example import get_response

#RECORD TO paInt32 format

def get_keypress(stop_event):
    """Thread to detect when 'q' is pressed."""
    tty.setcbreak(sys.stdin)
    while not stop_event.is_set():
        ch = sys.stdin.read(1)
        if ch.lower() == 'q':
            stop_event.set()
            break

def record_until_q(p, stream, file_path, stop_event):
    """Continuously record until 'q' is pressed."""
    frames = []
    print("Recording... Press 'q' to stop.\n")
    while not stop_event.is_set():
        data = stream.read(1024)
        frames.append(data)
    print("Stopping recording...")

    with wave.open(file_path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(p.get_sample_size(pyaudio.paInt32))
        wf.setframerate(16000)
        wf.writeframes(b''.join(frames))

def main():
    model_size = "medium.en"
    model = WhisperModel(model_size, device="cpu", compute_type="float32")

    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt32,
                    channels=1,
                    rate=16000,
                    input=True,
                    frames_per_buffer=1024)

    stop_event = threading.Event()
    listener = threading.Thread(target=get_keypress, args=(stop_event,), daemon=True)
    listener.start()

    chunk_file = "temp_full_recording.wav"
    record_until_q(p, stream, chunk_file, stop_event)

    # Transcribe after stopping
    print("\nTranscribing...")
    segments, info = model.transcribe(chunk_file)
    text = "".join(segment.text for segment in segments)
    print(f"Detected language: {info.language}")
    print("Transcription:\n", text)
    response = get_response(text)
    print(f"OpenAI: ", response)

    # Save to log file
    with open("log.txt", "w") as f:
        f.write(text)

    # Cleanup
    stream.stop_stream()
    stream.close()
    p.terminate()
    os.remove(chunk_file)
    
    print("\nSaved transcription to log.txt ✅")

if __name__ == "__main__":
    main()
