"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToNative = sendToNative;
const NativeBridgeModule_1 = __importDefault(require("./specs/NativeBridgeModule"));
function sendToNative(name, data = {}) {
    NativeBridgeModule_1.default.sendEvent(name, data);
}
//# sourceMappingURL=sendToNative.js.map