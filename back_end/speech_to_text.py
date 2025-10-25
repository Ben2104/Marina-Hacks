from faster_whisper import WhisperModel
import google.generativeai as genai
import googlemaps
import re, time, json

import sounddevice as sd
from scipy.io.wavfile import write

api_key = "AIzaSyAU7P0LSe09Qm_v9cx_Dz2KdczlWI6rha0"


start = int(time.time())

model = WhisperModel("small.en", compute_type="int8_float16")
segments, info = model.transcribe(
    r"C:\Users\syngu\Downloads\CSULB\MarinaHack\Marina-Hacks\back_end\examples\audio.wav",
    vad_filter=True,
    beam_size=1,
    temperature=0.0,
    condition_on_previous_text=False,
)
input = "".join(s.text for s in segments)

print(input)

genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.5-flash")
response = model.generate_content(
    f"""You are a 911 operator assistant. 
All operators are busy, so you must quickly analyze the user's text.
1. Extract address or nearest location (list multiple options if ambiguous).
2. Identify the type of incident.
3. Output only in this format (keep plain text, no extra styling):

Address: 
Incident:

Input: {input}
"""
).text

print(response)

re = re.compile(
    r"""(?<=^Address:).*|
    (?<=^Incident:).*""",
    re.IGNORECASE | re.VERBOSE | re.MULTILINE,
)


matches = re.findall(response)
gmaps = googlemaps.Client(key="AIzaSyDzaK9HfZzQeVofp6b9yOhh1xTElmSqQeg")
query = matches[0]
results = gmaps.geocode(query)
loc = results[0]["geometry"]["location"]


event = {
    "Address": f'{results[0]["formatted_address"]}',
    "Incident": f"{matches[1].strip()}",
    "lat": f'{loc["lat"]}',
    "long": f'{loc["lng"]}',
}
end = int(time.time())

print(f"Time taken to sparse {end-start} seconds")
print(event)
