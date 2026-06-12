export type Companion = "友人" | "家族" | "恋人" | "一人旅" | "ペットと";
export type LocationType = "国内" | "海外";

export type TravelConditions = {
  residence: string;
  companion: Companion;
  start_date: string;
  duration: string;
  trip_days: number;
  budget: string;
  mood: string;
  location_type: LocationType;
  free_request: string;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type TravelSuggestion = {
  place: string;
  summary: string;
  reason: string;
  coordinates?: Coordinates | null;
};

export type CurrentWeather = {
  condition: string;
  temperature?: number | null;
  wind_speed?: number | null;
};

export type DailyWeather = {
  date: string;
  condition: string;
  temperature_min?: number | null;
  temperature_max?: number | null;
  is_trip_day: boolean;
};

export type WeatherResponse = {
  place: string;
  coordinates: Coordinates;
  current: CurrentWeather;
  daily: DailyWeather[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SavedPlan = {
  id: string;
  createdAt: string;
  conditions: TravelConditions;
  suggestion: TravelSuggestion;
  itinerary: string;
};
