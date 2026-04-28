import { useEffect } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import NativeBridgeModule from './specs/NativeBridgeModule';

const emitter = new NativeEventEmitter(NativeModules.NativeBridgeModule);

export function useBridgeEvent(
  eventName: string,
  callback: (data: Record<string, unknown>) => void
): void {
  useEffect(() => {
    NativeBridgeModule.addListener('BridgeEvent');

    const subscription = emitter.addListener(
      'BridgeEvent',
      (event: { name: string; data: Record<string, unknown> }) => {
        if (event.name === eventName) {
          callback(event.data);
        }
      }
    );

    return () => {
      subscription.remove();
      NativeBridgeModule.removeListeners(1);
    };
  }, [eventName, callback]);
}
