from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from urllib.parse import quote

import requests
from fastapi import HTTPException
from openai import OpenAI, OpenAIError

from .schemas import (
    ChatMessage,
    Coordinates,
    TravelConditions,
    TravelSuggestion,
    WeatherResponse,
)


WEATHER_MAP: dict[int, str] = {
    0: "快晴",
    1: "ほぼ快晴",
    2: "晴れ時々くもり",
    3: "くもり",
    45: "霧",
    48: "霧氷",
    51: "弱い霧雨",
    53: "霧雨",
    55: "強い霧雨",
    61: "小雨",
    63: "雨",
    65: "大雨",
    71: "小雪",
    73: "雪",
    75: "大雪",
    80: "にわか小雨",
    81: "にわか雨",
    82: "強いにわか雨",
    95: "雷雨",
    96: "雷雨と弱いひょう",
    99: "雷雨と強いひょう",
}


def _openai_client() -> OpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured.")
    return OpenAI()


def _tidy_place(name: str) -> str:
    value = name.strip()
    for sep in ("（", "(", "、", ","):
        if sep in value:
            value = value.split(sep)[0]
    for term in ("周辺", "エリア", "あたり"):
        value = value.replace(term, "")
    return value.strip()


def _google_search_url(query: str) -> str:
    return f"https://www.google.com/search?q={quote(query)}"


def geocode(place_name: str) -> Coordinates | None:
    q = _tidy_place(place_name)
    if not q:
        return None

    try:
        response = requests.get(
            "https://msearch.gsi.go.jp/address-search/AddressSearch",
            params={"q": q},
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException:
        return None

    if not isinstance(data, list) or not data:
        return None

    coords = (data[0].get("geometry") or {}).get("coordinates")
    if not coords or len(coords) < 2:
        return None

    return Coordinates(latitude=float(coords[1]), longitude=float(coords[0]))


def fetch_weather(
    place: str,
    start_date: date,
    trip_days: int,
    latitude: float | None = None,
    longitude: float | None = None,
) -> WeatherResponse:
    coords = (
        Coordinates(latitude=latitude, longitude=longitude)
        if latitude is not None and longitude is not None
        else geocode(place)
    )
    if not coords:
        raise HTTPException(status_code=404, detail="天気取得に必要な座標を取得できませんでした。")

    span = min(max(trip_days, 1), 16)
    end_date = start_date + timedelta(days=span - 1)
    params = {
        "latitude": coords.latitude,
        "longitude": coords.longitude,
        "current": "temperature_2m,weather_code,wind_speed_10m",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "timezone": "auto",
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
    }

    try:
        response = requests.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=8)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="天気APIへの接続に失敗しました。") from exc

    current = data.get("current") or {}
    daily = data.get("daily") or {}
    times = daily.get("time") or []
    codes = daily.get("weather_code") or []
    tmins = daily.get("temperature_2m_min") or []
    tmaxs = daily.get("temperature_2m_max") or []
    trip_dates = {(start_date + timedelta(days=i)).isoformat() for i in range(span)}

    daily_rows = []
    for index, day in enumerate(times):
        daily_rows.append(
            {
                "date": day,
                "condition": WEATHER_MAP.get(codes[index], "不明") if index < len(codes) else "不明",
                "temperature_min": tmins[index] if index < len(tmins) else None,
                "temperature_max": tmaxs[index] if index < len(tmaxs) else None,
                "is_trip_day": day in trip_dates,
            }
        )

    return WeatherResponse(
        place=place,
        coordinates=coords,
        current={
            "condition": WEATHER_MAP.get(current.get("weather_code"), "不明"),
            "temperature": current.get("temperature_2m"),
            "wind_speed": current.get("wind_speed_10m"),
        },
        daily=daily_rows,
    )


def generate_suggestions(conditions: TravelConditions) -> list[TravelSuggestion]:
    client = _openai_client()
    system_prompt = (
        "あなたは日本語で答える旅行コンシェルジュです。"
        "ユーザー条件に合う旅行先候補を3件だけ提案してください。"
        "必ずJSONだけを返してください。形式は"
        '{"suggestions":[{"place":"具体的な地名","summary":"100字程度の概要",'
        '"reason":"150字程度の推薦理由"}]}です。'
        "実在する場所を優先し、営業時間や料金など変わりやすい情報は断定しないでください。"
    )
    user_prompt = (
        f"居住地: {conditions.residence}\n"
        f"同行者: {conditions.companion}\n"
        f"開始日: {conditions.start_date.isoformat()}\n"
        f"期間: {conditions.duration} ({conditions.trip_days}日)\n"
        f"一人あたり予算: {conditions.budget}\n"
        f"気分: {conditions.mood}\n"
        f"旅行タイプ: {conditions.location_type}\n"
        f"自由要望: {conditions.free_request or 'なし'}"
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1200,
            temperature=0.7,
        )
        content = response.choices[0].message.content or "{}"
        payload = json.loads(content)
    except (OpenAIError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="AI生成に失敗しました。") from exc

    raw_suggestions = payload.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raise HTTPException(status_code=502, detail="AI応答の形式が正しくありません。")

    suggestions = []
    for item in raw_suggestions[:3]:
        if not isinstance(item, dict):
            continue
        place = str(item.get("place") or "").strip()
        if not place:
            continue
        suggestions.append(
            TravelSuggestion(
                place=place,
                summary=str(item.get("summary") or "").strip(),
                reason=str(item.get("reason") or "").strip(),
                coordinates=geocode(place),
            )
        )

    if len(suggestions) != 3:
        raise HTTPException(status_code=502, detail="旅行先候補を3件生成できませんでした。")
    return suggestions


def generate_itinerary(selected_place: str, conditions: TravelConditions) -> str:
    client = _openai_client()
    system_prompt = (
        "あなたは旅行プランナーです。指定された旅行先を厳守し、別の旅行先へ変更しないでください。"
        "日程、時間帯、訪問スポット、食事、移動の目安、雨天時の代替案を日本語で具体的に書いてください。"
        "スマホ画面で読みやすいプレーンテキスト中心で書き、見出し記号の###や太字記号の**は使わないでください。"
        "店舗や施設名には可能な範囲でMarkdownリンク形式の[施設名](URL)だけを使ってください。"
        "公式URLが確実でない場合は公式URL風の推測リンクを作らず、https://www.google.com/search?q=施設名 の検索リンクを使ってください。"
        "URLには空白や日本語を直接入れず、検索リンクではURLエンコードされた安全なURLを使ってください。"
        "AI生成内容は参考情報なので、営業時間・料金・予約可否は公式情報の確認を促してください。"
    )
    if conditions.companion == "ペットと":
        system_prompt += " ペット同伴不可の可能性が高い場所は避け、確認ポイントも書いてください。"

    user_prompt = (
        f"旅行先: {selected_place}\n"
        f"居住地: {conditions.residence}\n"
        f"同行者: {conditions.companion}\n"
        f"開始日: {conditions.start_date.isoformat()}\n"
        f"期間: {conditions.duration} ({conditions.trip_days}日)\n"
        f"予算: {conditions.budget}\n"
        f"気分: {conditions.mood}\n"
        f"旅行タイプ: {conditions.location_type}\n"
        f"自由要望: {conditions.free_request or 'なし'}"
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1800,
            temperature=0.7,
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail="AI生成に失敗しました。") from exc
    return response.choices[0].message.content or ""


def chat_about_plan(
    selected_place: str,
    conditions: TravelConditions,
    current_plan: str,
    history: list[ChatMessage],
    user_message: str,
) -> str:
    client = _openai_client()
    messages = [
        {
            "role": "system",
            "content": (
                "あなたは旅行プラン調整アシスタントです。"
                f"旅行先は必ず{selected_place}のままにしてください。"
                "ユーザーの要望に合わせ、必要ならプラン全体を更新して返してください。"
                "スマホ画面で読みやすいプレーンテキスト中心で書き、見出し記号の###や太字記号の**は使わないでください。"
                "リンクが必要な施設名だけMarkdownリンク形式の[施設名](URL)で書いてください。"
                "公式URLが確実でない場合は公式URL風の推測リンクを作らず、https://www.google.com/search?q=施設名 の検索リンクを使ってください。"
                "URLには空白や日本語を直接入れず、検索リンクではURLエンコードされた安全なURLを使ってください。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"旅行条件: {conditions.model_dump_json()}\n"
                f"現在のプラン:\n{current_plan}"
            ),
        },
    ]
    messages.extend({"role": item.role, "content": item.content} for item in history[-8:])
    messages.append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            messages=messages,
            max_tokens=1800,
            temperature=0.7,
        )
    except OpenAIError as exc:
        raise HTTPException(status_code=502, detail="AI生成に失敗しました。") from exc
    return response.choices[0].message.content or ""


def clean_markdown_for_share(text: str) -> str:
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1 (\2)", text)
    text = re.sub(r"#+\s*", "", text)
    return text.replace("**", "").strip()
