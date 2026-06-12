# travel_rec

AIが旅行先候補と旅行プランを提案するアプリです。

現在の構成は、iPhoneで動かす `Expo + React Native + TypeScript` アプリと、OpenAI APIキーを安全に扱う `FastAPI` バックエンドに分かれています。

## 全体像

```text
iPhone / Expo Go
  |
  | 旅行条件・チャット内容を送信
  v
FastAPI backend
  |
  | OpenAI / 天気 / 座標APIを呼び出す
  v
外部API
```

- `mobile/`: Expoアプリ
- `api/`: FastAPIバックエンド
- `travelapp.py`: 旧Streamlit版の参考実装

## 事前準備

必要なもの:

- Python 3.12系
- Node.js / npm
- iPhoneにExpo Goアプリ
- OpenAI APIキー
- PCとiPhoneを同じWi-Fiに接続

`.env` を作成してOpenAI APIキーを設定します。

```powershell
Copy-Item .env.example .env
```

`.env` の中身:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o
```

## PCでAPIを起動する

リポジトリ直下で実行します。

```powershell
cd C:\Users\shoma\Documents\travel_rec
.\.venv\Scripts\Activate.ps1
pip install -r api\requirements.txt
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` は、同じWi-Fi上のiPhoneからPCのFastAPIへアクセスできるようにするために必要です。

別ターミナルで疎通確認します。

```powershell
Invoke-RestMethod http://localhost:8000/health
```

期待結果:

```json
{"status":"ok"}
```

## PCでExpoアプリを起動する

別ターミナルで実行します。

```powershell
cd C:\Users\shoma\Documents\travel_rec\mobile
npm install
npm run typecheck
npx expo start --lan
```

役割:

- `npm install`: Expoアプリに必要な依存パッケージをインストール
- `npm run typecheck`: TypeScriptの型チェック
- `npx expo start --lan`: 同じWi-Fi上のスマホから接続できるExpo開発サーバーを起動

起動後、ターミナルにQRコードが表示されます。

## スマホで起動する

1. iPhoneとPCを同じWi-Fiに接続します。
2. iPhoneでExpo Goを開きます。
3. `npx expo start --lan` で表示されたQRコードを読み込みます。
4. Expo Go上で `travel_rec` が起動します。

アプリ起動後、旅行先候補生成や天気取得を行うと、スマホ上のアプリがPC上のFastAPIへアクセスします。

## スマホからFastAPIに接続できるか確認する

PCのWi-Fi用IPv4アドレスを確認します。

```powershell
ipconfig
```

`Wireless LAN adapter Wi-Fi` の `IPv4 Address` を見ます。

現在確認できているPCのIPは以下です。

```text
192.168.1.3
```

iPhoneのSafariで以下を開きます。

```text
http://192.168.1.3:8000/health
```

これが表示されれば、iPhoneからFastAPIへ接続できています。

```json
{"status":"ok"}
```

## API URLの設定

`mobile/app.json` の `extra.apiBaseUrl` に、PCのIPアドレスを指定します。

現在の設定:

```json
"extra": {
  "apiBaseUrl": "http://192.168.1.3:8000"
}
```

PCのIPが変わった場合は、この値も変更してください。

注意:

- `localhost` はiPhone自身を指します。
- iPhoneからPC上のFastAPIへ接続するには、`localhost` ではなくPCのLAN IPを使います。
- FastAPIは `--host 0.0.0.0` で起動しておく必要があります。

## テスト

Pythonの構文チェック:

```powershell
python -m py_compile api\main.py api\schemas.py api\services.py
```

APIテスト:

```powershell
python -m pytest
```

Expoアプリの型チェック:

```powershell
cd mobile
npm run typecheck
```

## よく使うURL

PCからFastAPI確認:

```text
http://localhost:8000/health
```

iPhoneからFastAPI確認:

```text
http://192.168.1.3:8000/health
```

Expo開発サーバー:

```text
exp://192.168.1.3:8081
```

## トラブルシュート

### iPhoneでAPIにつながらない

- PCとiPhoneが同じWi-Fiか確認する
- `ipconfig` でPCのIPv4アドレスを再確認する
- `mobile/app.json` の `apiBaseUrl` が正しいか確認する
- FastAPIを `--host 0.0.0.0 --port 8000` で起動しているか確認する
- Windowsファイアウォールが8000番ポートをブロックしていないか確認する

### Expoアプリが起動しない

```powershell
cd mobile
npm install
npx expo start --clear --lan
```

### npm installで脆弱性警告が出る

ExpoやReact Nativeの内部依存に対する警告が含まれます。詳細確認:

```powershell
cd mobile
npm audit
```

自動修正:

```powershell
npm audit fix
```

`npm audit fix --force` はExpo/React Nativeの互換性を壊す可能性があるため、すぐには使わないでください。

## App Store提出前に必要なこと

- 本番用FastAPIをクラウドにデプロイする
- `apiBaseUrl` を本番API URLに変更する
- アプリアイコンとスプラッシュ画像を用意する
- `ios.bundleIdentifier` を自分のApple Developer Program用IDに変更する
- プライバシーポリシーURLとサポートURLを用意する
- App Store ConnectでApp Privacy Detailsを申告する
- AI生成内容は参考情報であり、営業時間・料金・予約可否は公式情報確認が必要と明記する
