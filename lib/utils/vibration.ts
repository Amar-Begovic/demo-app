export function vibrateSuccess(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(200);
  }
}

export function vibrateError(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([100, 100, 100]);
  }
}
