import Foundation

@objc public class BridgeEventEmitter: NSObject {

    @objc public static let shared = BridgeEventEmitter()

    private let queue = DispatchQueue(label: "com.bridgelib.BridgeEventEmitter", attributes: .concurrent)
    private var listeners: [String: ([String: Any]) -> Void] = [:]
    private var popToNativeCallback: (() -> Void)?
    private var globalEventListener: ((String, [String: Any]) -> Void)?

    private override init() {}

    @objc public func send(_ eventName: String, body: [String: Any] = [:]) {
        guard let module = NativeBridgeModule.shared else {
            NSLog("[BridgeEventEmitter] React Native가 실행 중이 아닙니다. BridgeLibManager.initialize()가 호출되었는지 확인하세요.")
            return
        }
        module.emitToJS(eventName: eventName, data: body)
    }

    @objc public func on(_ eventName: String, callback: @escaping ([String: Any]) -> Void) {
        queue.async(flags: .barrier) { self.listeners[eventName] = callback }
    }

    @objc public func off(_ eventName: String) {
        queue.async(flags: .barrier) { self.listeners.removeValue(forKey: eventName) }
    }

    public func setGlobalEventListener(_ listener: ((String, [String: Any]) -> Void)?) {
        queue.async(flags: .barrier) { self.globalEventListener = listener }
    }

    internal func handleFromRN(name: String, data: [String: Any]) {
        queue.async {
            self.listeners[name]?(data)
            self.globalEventListener?(name, data)
        }
    }

    internal func setPopToNativeCallback(_ callback: (() -> Void)?) {
        queue.async(flags: .barrier) { self.popToNativeCallback = callback }
    }

    internal func handlePopToNative() {
        // Read callback on concurrent queue, then invoke on main thread (UIKit navigation 보장).
        queue.async {
            let cb = self.popToNativeCallback
            DispatchQueue.main.async { cb?() }
        }
    }
}
