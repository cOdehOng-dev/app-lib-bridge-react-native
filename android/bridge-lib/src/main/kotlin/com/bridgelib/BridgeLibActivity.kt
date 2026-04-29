package com.bridgelib

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.facebook.react.ReactDelegate
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibActivity : AppCompatActivity(), DefaultHardwareBackBtnHandler {

    private var reactDelegate: ReactDelegate? = null

    var onPopRequested: (() -> Unit)? = null

    @Volatile private var backEnabled: Boolean = true

    fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val moduleName = intent.getStringExtra(EXTRA_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibActivity: 'bridge_lib_module_name' extra가 필요합니다."
            )
        val initialProps = intent.getBundleExtra(EXTRA_INITIAL_PROPS)

        reactDelegate = ReactDelegate(
            this,
            BridgeLibHost.getReactHost(),
            moduleName,
            initialProps
        ).also { delegate ->
            delegate.loadApp()
            setContentView(delegate.reactRootView)
        }

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() ?: finish() }
    }

    override fun invokeDefaultOnBackPressed() {
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!backEnabled) return
        reactDelegate?.onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        reactDelegate?.onHostResume()
    }

    override fun onPause() {
        super.onPause()
        reactDelegate?.onHostPause()
    }

    override fun onDestroy() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactDelegate?.onHostDestroy()
        reactDelegate = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_MODULE_NAME = "bridge_lib_module_name"
        const val EXTRA_INITIAL_PROPS = "bridge_lib_initial_props"

        fun start(
            context: Context,
            moduleName: String,
            initialProps: Bundle? = null
        ) {
            val intent = Intent(context, BridgeLibActivity::class.java).apply {
                putExtra(EXTRA_MODULE_NAME, moduleName)
                initialProps?.let { putExtra(EXTRA_INITIAL_PROPS, it) }
                if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }
}
