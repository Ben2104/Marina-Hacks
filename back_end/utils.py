import google.generativeai as genai
import googlemaps
import re, os
from faster_whisper import WhisperModel
from dotenv import load_dotenv
import torch

load_dotenv()

def extract_event(audio_file):
    compute_type = "int8_float16" if torch.cuda.is_available() else "float32"
    model = WhisperModel("small.en", compute_type=compute_type)
    segments, info = model.transcribe(
        audio_file,
        vad_filter=True,
        beam_size=1,
        temperature=0.0,
        condition_on_previous_text=False,
    )
    return "".join(s.text for s in segments)


def parse_event(event):
    api_key = os.getenv("GOOGLEGEM_API_KEY")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content(
        f"""You are a 911 operator assistant. 
    All operators are busy, so you must quickly analyze the user's text.
    1. Extract address or nearest location (list multiple options if ambiguous).
    2. Identify the type of incident.
    3. Output only in this format (keep plain text, no extra styling):

    Address: 
    Incident: Crime| Medical| Fire| Non-emergency:

    Input: {event}
    """
    ).text

    pattern = re.compile(
        r"""(?<=^Address:).*|
        (?<=^Incident:).*""",
        re.IGNORECASE | re.VERBOSE | re.MULTILINE,
    )

    matches = pattern.findall(response)
    gmaps = googlemaps.Client(key=os.getenv("GOOGLEMAP_API_KEY"))
    query = matches[0]
    response = gmaps.geocode(query)
    result = {}

    if response:
        loc = response[0]["geometry"]["location"]
        result = {
            "Address": f'{response[0]["formatted_address"]}',
            "Incident": f"{matches[1].strip()}",
            "lat": f'{loc["lat"]}',
            "long": f'{loc["lng"]}',
        }
    return result

