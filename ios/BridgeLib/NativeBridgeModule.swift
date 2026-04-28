import Foundation
import React

@objc(NativeBridgeModule)
class NativeBridgeModule: RCTEventEmitter {

    @objc static weak var shared: NativeBridgeModule?

    override init() {
        super.init()
        NativeBridgeModule.shared = self
    }

    override class func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String] {
        return ["BridgeEvent"]
    }

    override func startObserving() {}
    override func stopObserving() {}

    @objc func sendEvent(_ name: String, data: NSDictionary) {
        BridgeEventEmitter.shared.handleFromRN(
            name: name,
            data: data as? [String: Any] ?? [:]
        )
    }

    func emitToJS(eventName: String, data: [String: Any]) {
        sendEvent(withName: "BridgeEvent", body: ["name": eventName, "data": data])
    }
}
