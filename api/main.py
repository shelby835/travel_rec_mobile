from datetime import date

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ChatRequest,
    ChatResponse,
    ItineraryRequest,
    ItineraryResponse,
    SuggestionsResponse,
    TravelConditions,
)
from .services import chat_about_plan, fetch_weather, generate_itinerary, generate_suggestions


load_dotenv()

app = FastAPI(title="travel_rec API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/suggestions", response_model=SuggestionsResponse)
def create_suggestions(conditions: TravelConditions):
    return SuggestionsResponse(suggestions=generate_suggestions(conditions))


@app.post("/itinerary", response_model=ItineraryResponse)
def create_itinerary(request: ItineraryRequest):
    return ItineraryResponse(
        itinerary=generate_itinerary(request.selected_place, request.conditions)
    )


@app.post("/chat", response_model=ChatResponse)
def create_chat_reply(request: ChatRequest):
    return ChatResponse(
        reply=chat_about_plan(
            request.selected_place,
            request.conditions,
            request.current_plan,
            request.messages,
            request.user_message,
        )
    )


@app.get("/weather")
def get_weather(
    place: str = Query(..., min_length=1),
    start_date: date = Query(...),
    trip_days: int = Query(1, ge=1, le=16),
    latitude: float | None = None,
    longitude: float | None = None,
):
    return fetch_weather(place, start_date, trip_days, latitude, longitude)
