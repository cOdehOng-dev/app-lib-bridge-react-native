import Foundation

@objc public class BridgeEventEmitter: NSObject {

    @objc public static let shared = BridgeEventEmitter()

    private var listeners: [String: ([String: Any]) -> Void] = [:]

    private override init() {}

    /// 네이티브 → RN 이벤트 전송
    @objc public func send(_ eventName: String, body: [String: Any] = [:]) {
        guard let module = NativeBridgeModule.shared else {
            NSLog("[BridgeEventEmitter] React Native가 실행 중이 아닙니다. BridgeLibManager.initialize()가 호출되었는지 확인하세요.")
            return
        }
        module.emitToJS(eventName: eventName, data: body)
    }

    /// RN → 네이티브 이벤트 리스너 등록
    @objc public func on(_ eventName: String, callback: @escaping ([String: Any]) -> Void) {
        listeners[eventName] = callback
    }

    /// RN → 네이티브 이벤트 리스너 해제
    @objc public func off(_ eventName: String) {
        listeners.removeValue(forKey: eventName)
    }

    internal func handleFromRN(name: String, data: [String: Any]) {
        listeners[name]?(data)
    }
}
