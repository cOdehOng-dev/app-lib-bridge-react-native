package com.bridgelib

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NativeBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NativeBridgeModule"
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        BridgeEventBus.setModule(this)
    }

    override fun invalidate() {
        BridgeEventBus.setModule(null)
        super.invalidate()
    }

    @ReactMethod
    fun sendEvent(name: String, data: ReadableMap) {
        BridgeEventBus.handleFromRN(name, data.toHashMap())
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // NativeEventEmitter 요구 사항
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // NativeEventEmitter 요구 사항
    }

    internal fun emitToJS(eventName: String, data: Map<String, Any?>) {
        if (!reactApplicationContext.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putString("name", eventName)
            val dataMap = Arguments.createMap()
            data.forEach { (key, value) ->
                when (value) {
                    is String -> dataMap.putString(key, value)
                    is Int -> dataMap.putInt(key, value)
                    is Double -> dataMap.putDouble(key, value)
                    is Boolean -> dataMap.putBoolean(key, value)
                    is Long -> dataMap.putDouble(key, value.toDouble())
                    null -> dataMap.putNull(key)
                    else -> dataMap.putString(key, value.toString())
                }
            }
            putMap("data", dataMap)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("BridgeEvent", params)
    }
}
