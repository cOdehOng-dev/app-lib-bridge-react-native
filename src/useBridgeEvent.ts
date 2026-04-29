import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import NativeBridgeModule from './specs/NativeBridgeModule';

const emitter = new NativeEventEmitter(NativeModules.NativeBridgeModule);

export function useBridgeEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  eventName: string,
  callback: (data: T) => void
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    NativeBridgeModule.addListener('BridgeEvent');

    const subscription = emitter.addListener(
      'BridgeEvent',
      // Developer-facing assertion: runtime does not enforce T shape (NativeEventEmitter is untyped).
      (event: { name: string; data: T }) => {
        if (event.name === eventName) {
          callbackRef.current(event.data);
        }
      }
    );

    return () => {
      subscription.remove();
      NativeBridgeModule.removeListeners(1);
    };
  }, [eventName]);
}
