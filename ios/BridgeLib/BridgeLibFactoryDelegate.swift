import Foundation
import React_RCTAppDelegate

class BridgeLibFactoryDelegate: RCTDefaultReactNativeFactoryDelegate {

    private let bundleConfig: BundleConfig

    init(bundleConfig: BundleConfig) {
        self.bundleConfig = bundleConfig
        super.init()
    }

    override func bundleURL() -> URL? {
        return bundleConfig.resolvedURL()
    }
}
