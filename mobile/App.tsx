import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import {
  API_BASE_URL,
  fetchItinerary,
  fetchSuggestions,
  fetchWeather,
  sendChatMessage
} from "./src/api";
import { deletePlan, loadSavedPlans, savePlan } from "./src/storage";
import type {
  ChatMessage,
  Companion,
  LocationType,
  SavedPlan,
  TravelConditions,
  TravelSuggestion,
  WeatherResponse
} from "./src/types";

const COMPANIONS: Companion[] = ["友人", "家族", "恋人", "一人旅", "ペットと"];
const DURATIONS = [
  { label: "日帰り", days: 1 },
  { label: "1泊2日", days: 2 },
  { label: "2泊3日", days: 3 },
  { label: "3泊4日", days: 4 },
  { label: "4泊5日", days: 5 },
  { label: "5泊6日", days: 6 },
  { label: "一週間以上", days: 7 }
];
const BUDGETS = ["気にしない", "1万円未満", "1万〜3万円", "3万〜5万円", "5万〜10万円", "10万円以上"];
const MOODS = ["のんびりリラックス", "アクティブ", "ロマンティック", "文化体験", "自然探索", "食べ歩き"];
const LOCATION_TYPES: LocationType[] = ["国内", "海外"];

type Screen = "form" | "suggestions" | "detail" | "plan" | "saved";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialConditions(): TravelConditions {
  return {
    residence: "東京都",
    companion: "友人",
    start_date: todayIso(),
    duration: "日帰り",
    trip_days: 1,
    budget: "気にしない",
    mood: "のんびりリラックス",
    location_type: "国内",
    free_request: ""
  };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("form");
  const [conditions, setConditions] = useState<TravelConditions>(createInitialConditions);
  const [suggestions, setSuggestions] = useState<TravelSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<TravelSuggestion | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [itinerary, setItinerary] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [loading, setLoading] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadSavedPlans().then(setSavedPlans).catch(() => setSavedPlans([]));
  }, []);

  const canSubmit = conditions.residence.trim().length > 0;
  const selectedPlace = selectedSuggestion?.place ?? "";

  const shareText = useMemo(() => {
    if (!selectedSuggestion || !itinerary) {
      return "";
    }
    return `${selectedSuggestion.place}\n\n${itinerary}\n\nAI生成内容は参考情報です。営業時間・料金・予約可否は公式情報を確認してください。`;
  }, [itinerary, selectedSuggestion]);

  async function handleFetchSuggestions() {
    if (!canSubmit) {
      setErrorMessage("居住地を入力してください。");
      return;
    }
    setLoading("旅行先候補を生成中...");
    setErrorMessage("");
    try {
      const nextSuggestions = await fetchSuggestions(conditions);
      setSuggestions(nextSuggestions);
      setSelectedSuggestion(null);
      setWeather(null);
      setItinerary("");
      setChatMessages([]);
      setScreen("suggestions");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI生成に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  async function handleSelectSuggestion(suggestion: TravelSuggestion) {
    setSelectedSuggestion(suggestion);
    setWeather(null);
    setErrorMessage("");
    setScreen("detail");
    setLoading("天気を取得中...");
    try {
      const nextWeather = await fetchWeather(suggestion.place, conditions, suggestion.coordinates);
      setWeather(nextWeather);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "天気取得に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  async function handleCreateItinerary() {
    if (!selectedSuggestion) {
      return;
    }
    setLoading("詳細プランを生成中...");
    setErrorMessage("");
    try {
      const nextItinerary = await fetchItinerary(selectedSuggestion.place, conditions);
      setItinerary(nextItinerary);
      setChatMessages([]);
      setScreen("plan");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI生成に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  async function handleSendChat() {
    if (!selectedSuggestion || !itinerary || !chatInput.trim()) {
      return;
    }
    const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatInput("");
    setLoading("プランを調整中...");
    setErrorMessage("");
    try {
      const reply = await sendChatMessage(
        selectedSuggestion.place,
        conditions,
        itinerary,
        chatMessages,
        userMessage.content
      );
      setItinerary(reply);
      setChatMessages([...nextMessages, { role: "assistant", content: reply }]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "AI生成に失敗しました。");
      setChatMessages(chatMessages);
    } finally {
      setLoading("");
    }
  }

  async function handleSavePlan() {
    if (!selectedSuggestion || !itinerary) {
      return;
    }
    const plan: SavedPlan = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      conditions,
      suggestion: selectedSuggestion,
      itinerary
    };
    const nextPlans = await savePlan(plan);
    setSavedPlans(nextPlans);
    Alert.alert("保存しました", "保存済みプランからいつでも見返せます。");
  }

  async function handleDeletePlan(planId: string) {
    const nextPlans = await deletePlan(planId);
    setSavedPlans(nextPlans);
  }

  async function handleShare() {
    if (!shareText) {
      return;
    }
    await Share.share({ message: shareText });
  }

  function openSavedPlan(plan: SavedPlan) {
    setConditions(plan.conditions);
    setSelectedSuggestion(plan.suggestion);
    setItinerary(plan.itinerary);
    setWeather(null);
    setChatMessages([]);
    setScreen("plan");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>travel_rec</Text>
            <Text style={styles.subtitle}>AI旅行プランナー</Text>
          </View>
          <Pressable style={styles.savedButton} onPress={() => setScreen("saved")}>
            <Text style={styles.savedButtonText}>保存済み</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {(["form", "suggestions", "detail", "plan"] as Screen[]).map((item) => (
            <Pressable
              key={item}
              style={[styles.tab, screen === item && styles.tabActive]}
              onPress={() => setScreen(item)}
            >
              <Text style={[styles.tabText, screen === item && styles.tabTextActive]}>
                {item === "form" ? "条件" : item === "suggestions" ? "候補" : item === "detail" ? "天気" : "プラン"}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>{loading}</Text>
          </View>
        ) : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {screen === "form" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>旅の条件</Text>
              <Field label="出発地・居住地">
                <TextInput
                  value={conditions.residence}
                  onChangeText={(residence) => setConditions({ ...conditions, residence })}
                  placeholder="例: 東京都"
                  style={styles.input}
                />
              </Field>
              <Field label="旅行開始日">
                <TextInput
                  value={conditions.start_date}
                  onChangeText={(start_date) => setConditions({ ...conditions, start_date })}
                  placeholder="YYYY-MM-DD"
                  style={styles.input}
                />
              </Field>
              <ChoiceGroup
                label="同行者"
                values={COMPANIONS}
                selected={conditions.companion}
                onSelect={(companion) => setConditions({ ...conditions, companion })}
              />
              <ChoiceGroup
                label="期間"
                values={DURATIONS.map((item) => item.label)}
                selected={conditions.duration}
                onSelect={(duration) => {
                  const durationItem = DURATIONS.find((item) => item.label === duration) ?? DURATIONS[0];
                  setConditions({ ...conditions, duration, trip_days: durationItem.days });
                }}
              />
              <ChoiceGroup
                label="予算"
                values={BUDGETS}
                selected={conditions.budget}
                onSelect={(budget) => setConditions({ ...conditions, budget })}
              />
              <ChoiceGroup
                label="気分"
                values={MOODS}
                selected={conditions.mood}
                onSelect={(mood) => setConditions({ ...conditions, mood })}
              />
              <ChoiceGroup
                label="旅行タイプ"
                values={LOCATION_TYPES}
                selected={conditions.location_type}
                onSelect={(location_type) => setConditions({ ...conditions, location_type })}
              />
              <Field label="自由要望">
                <TextInput
                  value={conditions.free_request}
                  onChangeText={(free_request) => setConditions({ ...conditions, free_request })}
                  placeholder="例: 海鮮が美味しい宿に泊まりたい"
                  style={[styles.input, styles.textArea]}
                  multiline
                />
              </Field>
              <PrimaryButton label="旅行先を3件提案" onPress={handleFetchSuggestions} disabled={!canSubmit || !!loading} />
              <Text style={styles.note}>API: {API_BASE_URL}</Text>
            </View>
          ) : null}

          {screen === "suggestions" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>旅行先候補</Text>
              {suggestions.length === 0 ? (
                <EmptyState text="条件画面から旅行先候補を生成してください。" />
              ) : (
                suggestions.map((suggestion, index) => (
                  <Pressable
                    key={`${suggestion.place}-${index}`}
                    style={styles.card}
                    onPress={() => handleSelectSuggestion(suggestion)}
                  >
                    <Text style={styles.cardEyebrow}>候補 {index + 1}</Text>
                    <Text style={styles.cardTitle}>{suggestion.place}</Text>
                    <Text style={styles.cardText}>{suggestion.summary}</Text>
                    <Text style={styles.cardText}>{suggestion.reason}</Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}

          {screen === "detail" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{selectedPlace || "候補詳細"}</Text>
              {!selectedSuggestion ? (
                <EmptyState text="候補一覧から旅行先を選んでください。" />
              ) : (
                <>
                  <Text style={styles.body}>{selectedSuggestion.summary}</Text>
                  <Text style={styles.body}>{selectedSuggestion.reason}</Text>
                  <WeatherPanel weather={weather} />
                  <PrimaryButton label="この旅行先で詳細プランを作る" onPress={handleCreateItinerary} disabled={!!loading} />
                </>
              )}
            </View>
          ) : null}

          {screen === "plan" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>詳細プラン</Text>
              {!itinerary ? (
                <EmptyState text="旅行先詳細からプランを生成してください。" />
              ) : (
                <>
                  <Text style={styles.planText}>{itinerary}</Text>
                  <View style={styles.actionRow}>
                    <SecondaryButton label="保存" onPress={handleSavePlan} />
                    <SecondaryButton label="共有" onPress={handleShare} />
                  </View>
                  <Text style={styles.subheading}>AIに調整を依頼</Text>
                  {chatMessages.slice(-4).map((message, index) => (
                    <View key={`${message.role}-${index}`} style={styles.chatBubble}>
                      <Text style={styles.chatRole}>{message.role === "user" ? "あなた" : "AI"}</Text>
                      <Text style={styles.chatText}>{message.content}</Text>
                    </View>
                  ))}
                  <TextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="例: もっとアクティブな予定にして"
                    style={[styles.input, styles.textArea]}
                    multiline
                  />
                  <PrimaryButton label="調整する" onPress={handleSendChat} disabled={!chatInput.trim() || !!loading} />
                </>
              )}
            </View>
          ) : null}

          {screen === "saved" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>保存済みプラン</Text>
              {savedPlans.length === 0 ? (
                <EmptyState text="保存済みの旅行プランはまだありません。" />
              ) : (
                savedPlans.map((plan) => (
                  <View key={plan.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{plan.suggestion.place}</Text>
                    <Text style={styles.cardText}>
                      {new Date(plan.createdAt).toLocaleString()} / {plan.conditions.duration}
                    </Text>
                    <View style={styles.actionRow}>
                      <SecondaryButton label="開く" onPress={() => openSavedPlan(plan)} />
                      <SecondaryButton label="削除" onPress={() => handleDeletePlan(plan.id)} />
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ChoiceGroup<T extends string>({
  label,
  values,
  selected,
  onSelect
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <View style={styles.choiceWrap}>
        {values.map((value) => (
          <Pressable
            key={value}
            style={[styles.choice, selected === value && styles.choiceActive]}
            onPress={() => onSelect(value)}
          >
            <Text style={[styles.choiceText, selected === value && styles.choiceTextActive]}>{value}</Text>
          </Pressable>
        ))}
      </View>
    </Field>
  );
}

function WeatherPanel({ weather }: { weather: WeatherResponse | null }) {
  if (!weather) {
    return <EmptyState text="天気情報はまだありません。取得に失敗した場合は詳細プランだけ作成できます。" />;
  }
  return (
    <View style={styles.weatherBox}>
      <Text style={styles.subheading}>天気</Text>
      <Text style={styles.body}>
        現在: {weather.current.condition} / {weather.current.temperature ?? "-"}度 / 風速{" "}
        {weather.current.wind_speed ?? "-"} m/s
      </Text>
      {weather.daily.map((day) => (
        <Text key={day.date} style={styles.weatherLine}>
          {day.is_trip_day ? "旅行日 " : ""}
          {day.date}: {day.condition} ({day.temperature_min ?? "-"}度〜{day.temperature_max ?? "-"}度)
        </Text>
      ))}
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7f3ec"
  },
  keyboard: {
    flex: 1
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  appName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#25312b"
  },
  subtitle: {
    color: "#6b756f",
    marginTop: 2
  },
  savedButton: {
    borderWidth: 1,
    borderColor: "#25312b",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  savedButtonText: {
    color: "#25312b",
    fontWeight: "700"
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#ebe4d7",
    alignItems: "center"
  },
  tabActive: {
    backgroundColor: "#25312b"
  },
  tabText: {
    color: "#536059",
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#ffffff"
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  section: {
    gap: 14
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#25312b"
  },
  field: {
    gap: 8
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#37443d"
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1c7b8",
    backgroundColor: "#fffdf8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#25312b"
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top"
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choice: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1c7b8",
    backgroundColor: "#fffdf8"
  },
  choiceActive: {
    backgroundColor: "#d86f45",
    borderColor: "#d86f45"
  },
  choiceText: {
    color: "#37443d",
    fontWeight: "700"
  },
  choiceTextActive: {
    color: "#ffffff"
  },
  primaryButton: {
    backgroundColor: "#d86f45",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#25312b",
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: "#25312b",
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.5
  },
  loading: {
    margin: 12,
    padding: 12,
    backgroundColor: "#fffdf8",
    borderRadius: 8,
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  loadingText: {
    color: "#37443d"
  },
  error: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#ffe8e1",
    color: "#9b2f15",
    fontWeight: "700"
  },
  card: {
    backgroundColor: "#fffdf8",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2d8ca",
    gap: 8
  },
  cardEyebrow: {
    color: "#d86f45",
    fontWeight: "800"
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#25312b"
  },
  cardText: {
    color: "#4a554f",
    lineHeight: 21
  },
  body: {
    color: "#37443d",
    lineHeight: 22
  },
  empty: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#fffdf8",
    color: "#6b756f",
    lineHeight: 22
  },
  weatherBox: {
    backgroundColor: "#fffdf8",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2d8ca",
    padding: 14,
    gap: 8
  },
  subheading: {
    fontSize: 17,
    fontWeight: "800",
    color: "#25312b",
    marginTop: 8
  },
  weatherLine: {
    color: "#4a554f",
    lineHeight: 21
  },
  planText: {
    color: "#25312b",
    lineHeight: 23,
    backgroundColor: "#fffdf8",
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2d8ca"
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  chatBubble: {
    backgroundColor: "#fffdf8",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2d8ca"
  },
  chatRole: {
    fontWeight: "800",
    color: "#d86f45",
    marginBottom: 4
  },
  chatText: {
    color: "#37443d",
    lineHeight: 21
  },
  note: {
    color: "#6b756f",
    fontSize: 12
  }
});
