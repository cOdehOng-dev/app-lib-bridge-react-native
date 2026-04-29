import NativeBridgeModule from './specs/NativeBridgeModule';

export function sendToNative(
  name: string,
  data: Record<string, unknown> = {},
): void {
  NativeBridgeModule.sendEvent(name, data);
}
