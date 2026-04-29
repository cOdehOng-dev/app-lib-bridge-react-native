import Foundation
import React

@objc public class BundleConfig: NSObject {
    @objc public let devURL: URL
    @objc public let assetName: String
    @objc public let localBundleURL: URL?

    /// - Parameters:
    ///   - devURL: Metro 개발 서버 URL (DEBUG 빌드에서 사용)
    ///   - assetName: 앱 번들 내 .jsbundle 파일명 (확장자 제외, 예: "main")
    ///   - localBundleURL: OTA로 다운로드된 번들의 로컬 파일 URL. nil이면 assetName 사용
    @objc public init(
        devURL: URL,
        assetName: String,
        localBundleURL: URL? = nil
    ) {
        self.devURL = devURL
        self.assetName = assetName
        self.localBundleURL = localBundleURL
    }

    /// Resolves the active bundle URL based on build configuration.
    /// Internal use only — consumed by BridgeLibFactoryDelegate.
    func resolvedURL() -> URL? {
        #if DEBUG
        return devURL
        #else
        if let localURL = localBundleURL {
            return localURL
        }
        return Bundle.main.url(forResource: assetName, withExtension: "jsbundle")
        #endif
    }
}
