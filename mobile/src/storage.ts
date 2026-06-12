import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedPlan } from "./types";

const SAVED_PLANS_KEY = "travel_rec.saved_plans";

export async function loadSavedPlans(): Promise<SavedPlan[]> {
  const raw = await AsyncStorage.getItem(SAVED_PLANS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePlan(plan: SavedPlan): Promise<SavedPlan[]> {
  const plans = await loadSavedPlans();
  const nextPlans = [plan, ...plans.filter((item) => item.id !== plan.id)].slice(0, 30);
  await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(nextPlans));
  return nextPlans;
}

export async function deletePlan(planId: string): Promise<SavedPlan[]> {
  const plans = await loadSavedPlans();
  const nextPlans = plans.filter((item) => item.id !== planId);
  await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(nextPlans));
  return nextPlans;
}
