import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  sendEvent(name: string, data: Object): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  popToNative(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeBridgeModule');
