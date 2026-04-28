import Foundation
import React_RCTAppDelegate

@objc public class BridgeLibManager: NSObject {

    @objc public static let shared = BridgeLibManager()

    private(set) var factory: RCTReactNativeFactory?
    private var delegate: BridgeLibFactoryDelegate?

    private override init() {}

    /// AppDelegate.application(_:didFinishLaunchingWithOptions:)에서 1회 호출
    @objc public func initialize(bundleConfig: BundleConfig) {
        guard factory == nil else {
            NSLog("[BridgeLibManager] 이미 초기화되었습니다. 두 번째 initialize() 호출은 무시됩니다.")
            return
        }
        let factoryDelegate = BridgeLibFactoryDelegate(bundleConfig: bundleConfig)
        self.delegate = factoryDelegate
        self.factory = RCTReactNativeFactory(delegate: factoryDelegate)
    }

    internal func getFactory() -> RCTReactNativeFactory {
        guard let factory = factory else {
            fatalError(
                "BridgeLibManager가 초기화되지 않았습니다. AppDelegate에서 BridgeLibManager.shared.initialize(bundleConfig:)를 호출하세요."
            )
        }
        return factory
    }
}
