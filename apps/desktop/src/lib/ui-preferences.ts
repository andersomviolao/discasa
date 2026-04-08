import type { MouseWheelBehavior } from "../ui-types";

export const VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY = "discasa.viewer.mouseWheelBehavior";
export const VIEWER_WHEEL_BEHAVIOR_EVENT = "discasa:viewer-wheel-behavior";

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  return raw === "1";
}

export function readStoredString(key: string, fallback: string): string {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  return raw && raw.trim().length > 0 ? raw : fallback;
}

export function readStoredNumber(key: string, fallback: number): number {
  if (!canUseWindow()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readStoredMouseWheelBehavior(): MouseWheelBehavior {
  if (!canUseWindow()) {
    return "zoom";
  }

  const raw = window.localStorage.getItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY);
  return raw === "navigate" ? "navigate" : "zoom";
}

export function commitMouseWheelBehavior(nextValue: MouseWheelBehavior): void {
  if (!canUseWindow()) {
    return;
  }

  window.localStorage.setItem(VIEWER_MOUSE_WHEEL_BEHAVIOR_KEY, nextValue);
  window.dispatchEvent(new CustomEvent<MouseWheelBehavior>(VIEWER_WHEEL_BEHAVIOR_EVENT, { detail: nextValue }));
}
