import NativeBridgeModule from './specs/NativeBridgeModule';

export function sendToNative<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  data: T = {} as T,
): void {
  NativeBridgeModule.sendEvent(name, data);
}
