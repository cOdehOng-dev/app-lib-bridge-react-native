"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBridgeEvent = useBridgeEvent;
const react_1 = require("react");
const react_native_1 = require("react-native");
const NativeBridgeModule_1 = __importDefault(require("./specs/NativeBridgeModule"));
const emitter = new react_native_1.NativeEventEmitter(react_native_1.NativeModules.NativeBridgeModule);
function useBridgeEvent(eventName, callback) {
    const callbackRef = (0, react_1.useRef)(callback);
    callbackRef.current = callback;
    (0, react_1.useEffect)(() => {
        NativeBridgeModule_1.default.addListener('BridgeEvent');
        const subscription = emitter.addListener('BridgeEvent', (event) => {
            if (event.name === eventName) {
                callbackRef.current(event.data);
            }
        });
        return () => {
            subscription.remove();
            NativeBridgeModule_1.default.removeListeners(1);
        };
    }, [eventName]);
}
//# sourceMappingURL=useBridgeEvent.js.map