let requestedModeKey: string | null = null;

export function requestThreadSearchMode(modeKey: string | null): void {
  requestedModeKey = modeKey;
}

export function takeRequestedThreadSearchMode(): string | null {
  const modeKey = requestedModeKey;
  requestedModeKey = null;
  return modeKey;
}
