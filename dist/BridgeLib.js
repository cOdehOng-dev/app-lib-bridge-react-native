"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeLib = void 0;
const package_json_1 = require("../package.json");
function resolveBundleMode() {
    if (__DEV__)
        return 'dev';
    return 'assets';
}
exports.BridgeLib = {
    bundleMode: resolveBundleMode(),
    version: package_json_1.version,
};
//# sourceMappingURL=BridgeLib.js.map