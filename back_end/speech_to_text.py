from utils import extract_event, parse_event
import json

event = extract_event(
    r"C:\Users\syngu\Downloads\CSULB\MarinaHack\Marina-Hacks\back_end\audio\audio.wav"
)

event_parsed = parse_event(event)

with open("output.json", "w") as file:
    json.dump(event_parsed, file)
