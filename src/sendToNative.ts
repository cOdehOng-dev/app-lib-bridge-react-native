import NativeBridgeModule from './specs/NativeBridgeModule';

export function sendToNative<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  // {} as T is safe only when T is the default (Record<string, unknown>). Callers with a concrete T should always pass an explicit data argument.
  data: T = {} as T,
): void {
  NativeBridgeModule.sendEvent(name, data);
}
