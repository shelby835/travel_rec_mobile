from datetime import date

from fastapi import HTTPException
from fastapi.testclient import TestClient

from api import main
from api.schemas import Coordinates, TravelSuggestion


client = TestClient(main.app)


def _conditions() -> dict:
    return {
        "residence": "東京都",
        "companion": "友人",
        "start_date": "2026-06-10",
        "duration": "日帰り",
        "trip_days": 1,
        "budget": "1万〜3万円",
        "mood": "のんびりリラックス",
        "location_type": "国内",
        "free_request": "海が見たい",
    }


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_suggestions_returns_three_items(monkeypatch) -> None:
    def fake_generate_suggestions(_conditions):
        return [
            TravelSuggestion(
                place="鎌倉",
                summary="海と寺社を楽しめる日帰り旅です。",
                reason="都内から近く、散策と食事のバランスが良いです。",
                coordinates=Coordinates(latitude=35.319, longitude=139.546),
            ),
            TravelSuggestion(place="箱根", summary="温泉と自然を楽しめます。", reason="移動しやすく癒やし向きです。"),
            TravelSuggestion(place="軽井沢", summary="自然と買い物を楽しめます。", reason="気分転換に向いています。"),
        ]

    monkeypatch.setattr(main, "generate_suggestions", fake_generate_suggestions)
    response = client.post("/suggestions", json=_conditions())
    assert response.status_code == 200
    assert len(response.json()["suggestions"]) == 3


def test_weather_failure_is_structured(monkeypatch) -> None:
    def fake_fetch_weather(*_args, **_kwargs):
        raise HTTPException(status_code=404, detail="天気取得に必要な座標を取得できませんでした。")

    monkeypatch.setattr(main, "fetch_weather", fake_fetch_weather)
    response = client.get(
        "/weather",
        params={"place": "不明な場所", "start_date": date.today().isoformat(), "trip_days": 1},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "天気取得に必要な座標を取得できませんでした。"
