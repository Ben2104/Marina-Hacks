from enum import Enum
from typing import Optional

from openai import OpenAI
from pydantic import BaseModel

from dotenv import load_dotenv
load_dotenv()


client = OpenAI()

class Category(str, Enum):
    medical = "medical"
    crime = "crime"
    fire = "fire"
    nonEmergency = "non-emergency"

class EmergencyDetails(BaseModel): 
    type_of_emergency: Category
    location: str 
    address: Optional[str]


def get_response(call_txt):
    response = client.responses.parse( model="gpt-5-nano",
    input=[
        {
            "role": "system", 
            "content": "Determine what type of emergency and the location of the emergency."
        },
        {
            "role": "user",
            "content": call_txt
        }
        ],
    text_format= EmergencyDetails,
    store=True,
    )

    compliance = response.output_parsed
    return compliance

