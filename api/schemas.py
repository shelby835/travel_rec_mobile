from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


Companion = Literal["友人", "家族", "恋人", "一人旅", "ペットと"]
LocationType = Literal["国内", "海外"]


class TravelConditions(BaseModel):
    residence: str = Field(..., min_length=1)
    companion: Companion
    start_date: date
    duration: str = Field(..., min_length=1)
    trip_days: int = Field(..., ge=1, le=16)
    budget: str = Field(..., min_length=1)
    mood: str = Field(..., min_length=1)
    location_type: LocationType
    free_request: str = ""


class Coordinates(BaseModel):
    latitude: float
    longitude: float


class TravelSuggestion(BaseModel):
    place: str
    summary: str
    reason: str
    coordinates: Coordinates | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[TravelSuggestion]


class ItineraryRequest(BaseModel):
    selected_place: str = Field(..., min_length=1)
    conditions: TravelConditions


class ItineraryResponse(BaseModel):
    itinerary: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    selected_place: str = Field(..., min_length=1)
    conditions: TravelConditions
    current_plan: str = Field(..., min_length=1)
    messages: list[ChatMessage] = []
    user_message: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    reply: str


class DailyWeather(BaseModel):
    date: str
    condition: str
    temperature_min: float | None = None
    temperature_max: float | None = None
    is_trip_day: bool = False


class CurrentWeather(BaseModel):
    condition: str
    temperature: float | None = None
    wind_speed: float | None = None


class WeatherResponse(BaseModel):
    place: str
    coordinates: Coordinates
    current: CurrentWeather
    daily: list[DailyWeather]
