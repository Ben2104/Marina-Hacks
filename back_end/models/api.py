from openai import OpenAI
from enum import Enum
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

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
    longitude: float
    latitude: float



def get_location(call_txt: str) -> EmergencyDetails:
    response = client.responses.parse(
        model="gpt-5-nano",
        input=[
            {
                "role": "system",
                "content": "Determine the type of emergency and its location."
            },
            {
                "role": "user",
                "content": call_txt
            }
        ],
        text_format=EmergencyDetails, 
        store=True,                  
    )

    compliance:EmergencyDetails = response.output_parsed # type: ignore
    return compliance
