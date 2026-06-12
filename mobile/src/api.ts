import Constants from "expo-constants";

import type {
  ChatMessage,
  TravelConditions,
  TravelSuggestion,
  WeatherResponse
} from "./types";

const configuredBaseUrl =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:8000";

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, "");

type ApiErrorKind = "network" | "ai" | "weather" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
  errorKind: ApiErrorKind
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      },
      ...options
    });
  } catch (error) {
    throw new ApiError("network", "サーバーに接続できませんでした。APIのURLと起動状態を確認してください。");
  }

  if (!response.ok) {
    let detail = "リクエストに失敗しました。";
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new ApiError(errorKind, detail);
  }

  return response.json() as Promise<T>;
}

export async function fetchSuggestions(
  conditions: TravelConditions
): Promise<TravelSuggestion[]> {
  const data = await requestJson<{ suggestions: TravelSuggestion[] }>(
    "/suggestions",
    {
      method: "POST",
      body: JSON.stringify(conditions)
    },
    "ai"
  );
  return data.suggestions;
}

export async function fetchWeather(
  place: string,
  conditions: TravelConditions,
  coordinates?: { latitude: number; longitude: number } | null
): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    place,
    start_date: conditions.start_date,
    trip_days: String(conditions.trip_days)
  });
  if (coordinates) {
    params.set("latitude", String(coordinates.latitude));
    params.set("longitude", String(coordinates.longitude));
  }
  return requestJson<WeatherResponse>(`/weather?${params.toString()}`, { method: "GET" }, "weather");
}

export async function fetchItinerary(
  selectedPlace: string,
  conditions: TravelConditions
): Promise<string> {
  const data = await requestJson<{ itinerary: string }>(
    "/itinerary",
    {
      method: "POST",
      body: JSON.stringify({
        selected_place: selectedPlace,
        conditions
      })
    },
    "ai"
  );
  return data.itinerary;
}

export async function sendChatMessage(
  selectedPlace: string,
  conditions: TravelConditions,
  currentPlan: string,
  messages: ChatMessage[],
  userMessage: string
): Promise<string> {
  const data = await requestJson<{ reply: string }>(
    "/chat",
    {
      method: "POST",
      body: JSON.stringify({
        selected_place: selectedPlace,
        conditions,
        current_plan: currentPlan,
        messages,
        user_message: userMessage
      })
    },
    "ai"
  );
  return data.reply;
}
