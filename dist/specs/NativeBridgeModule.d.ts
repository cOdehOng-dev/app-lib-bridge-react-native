import type { TurboModule } from 'react-native';
export interface Spec extends TurboModule {
    sendEvent(name: string, data: Object): void;
    addListener(eventName: string): void;
    removeListeners(count: number): void;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeBridgeModule.d.ts.map