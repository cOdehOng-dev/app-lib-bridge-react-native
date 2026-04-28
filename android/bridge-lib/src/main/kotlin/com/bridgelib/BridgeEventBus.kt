package com.bridgelib

object BridgeEventBus {

    @Volatile
    private var moduleRef: NativeBridgeModule? = null

    private val listeners = mutableMapOf<String, (Map<String, Any?>) -> Unit>()

    internal fun setModule(module: NativeBridgeModule?) {
        moduleRef = module
    }

    fun send(eventName: String, data: Map<String, Any?> = emptyMap()) {
        checkNotNull(moduleRef) {
            "React Native is not running. BridgeLibHost.init()가 호출되었는지 확인하세요."
        }.emitToJS(eventName, data)
    }

    fun on(eventName: String, listener: (Map<String, Any?>) -> Unit) {
        listeners[eventName] = listener
    }

    fun off(eventName: String) {
        listeners.remove(eventName)
    }

    internal fun handleFromRN(eventName: String, data: HashMap<String, Any?>) {
        listeners[eventName]?.invoke(data)
    }
}
