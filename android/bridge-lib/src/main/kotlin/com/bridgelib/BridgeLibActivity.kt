package com.bridgelib

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.facebook.react.ReactRootView

class BridgeLibActivity : AppCompatActivity() {

    private var reactRootView: ReactRootView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val moduleName = intent.getStringExtra(EXTRA_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibActivity: 'bridge_lib_module_name' extra가 필요합니다."
            )
        val initialProps = intent.getBundleExtra(EXTRA_INITIAL_PROPS)

        reactRootView = ReactRootView(this).also { view ->
            view.startReactApplication(
                BridgeLibHost.getReactHost(),
                moduleName,
                initialProps
            )
            setContentView(view)
        }
    }

    override fun onDestroy() {
        reactRootView?.unmountReactApplication()
        reactRootView = null
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
            }
            context.startActivity(intent)
        }
    }
}
