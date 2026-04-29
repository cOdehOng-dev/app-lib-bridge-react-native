import Foundation

// XCFramework 배포 시 framework 번들 위치를 특정하는 앵커.
// Bundle.main 대신 BridgeLibBundle을 사용해야 framework 내부 리소스를 올바르게 찾는다.
public let BridgeLibBundle = Bundle(for: BridgeLibBundleClass.self)
internal class BridgeLibBundleClass {}
