package com.bridgelib

import java.util.concurrent.ConcurrentHashMap

object BridgeEventBus {

    @Volatile
    private var moduleRef: NativeBridgeModule? = null

    private val listeners = ConcurrentHashMap<String, (Map<String, Any?>) -> Unit>()

    internal fun setModule(module: NativeBridgeModule?) {
        moduleRef = module
    }

    fun send(eventName: String, data: Map<String, Any?> = emptyMap()) {
        checkNotNull(moduleRef) {
            "NativeBridgeModule이 초기화되지 않았습니다. React Native가 아직 로딩 중일 수 있습니다."
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
