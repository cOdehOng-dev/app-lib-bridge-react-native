"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeLib = void 0;
function resolveBundleMode() {
    if (__DEV__)
        return 'dev';
    return 'assets';
}
exports.BridgeLib = {
    bundleMode: resolveBundleMode(),
    version: '1.0.0',
};
//# sourceMappingURL=BridgeLib.js.map