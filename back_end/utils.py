import google.generativeai as genai
import googlemaps
import re, os
from faster_whisper import WhisperModel
from dotenv import load_dotenv

load_dotenv()

def extract_event(audio_file):
    model = WhisperModel("small.en", compute_type="int8_float16")
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
    results = gmaps.geocode(query)
    loc = results[0]["geometry"]["location"]

    return {
        "Address": f'{results[0]["formatted_address"]}',
        "Incident": f"{matches[1].strip()}",
        "lat": f'{loc["lat"]}',
        "long": f'{loc["lng"]}',
    }

