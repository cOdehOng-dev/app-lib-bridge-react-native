package com.bridgelib

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

object BridgeEventBus {

    @Volatile
    private var moduleRef: NativeBridgeModule? = null

    private val pendingQueue = ConcurrentLinkedQueue<Pair<String, Map<String, Any?>>>()
    private val listeners = ConcurrentHashMap<String, (Map<String, Any?>) -> Unit>()

    @Volatile
    private var popToNativeCallback: (() -> Unit)? = null

    @Volatile
    private var globalEventListener: ((String, Map<String, Any?>) -> Unit)? = null

    fun setGlobalEventListener(listener: ((String, Map<String, Any?>) -> Unit)?) {
        globalEventListener = listener
    }

    internal fun setModule(module: NativeBridgeModule?) {
        moduleRef = module
        if (module != null) flushQueue(module)
    }

    private fun flushQueue(module: NativeBridgeModule) {
        while (true) {
            val item = pendingQueue.poll() ?: break
            module.emitToJS(item.first, item.second)
        }
    }

    fun send(eventName: String, data: Map<String, Any?> = emptyMap()) {
        val module = moduleRef
        if (module != null) {
            module.emitToJS(eventName, data)
        } else {
            pendingQueue.offer(Pair(eventName, data))
        }
    }

    fun on(eventName: String, listener: (Map<String, Any?>) -> Unit) {
        listeners[eventName] = listener
    }

    fun off(eventName: String) {
        listeners.remove(eventName)
    }

    internal fun handleFromRN(eventName: String, data: HashMap<String, Any?>) {
        listeners[eventName]?.invoke(data)
        globalEventListener?.invoke(eventName, data)
    }

    internal fun handlePopToNative() {
        popToNativeCallback?.invoke()
    }

    internal fun setPopToNativeCallback(callback: (() -> Unit)?) {
        popToNativeCallback = callback
    }
}
