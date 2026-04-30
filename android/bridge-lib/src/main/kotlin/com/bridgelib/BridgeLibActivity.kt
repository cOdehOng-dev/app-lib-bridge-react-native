package com.bridgelib

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.doOnAttach
import com.facebook.react.interfaces.fabric.ReactSurface
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler

class BridgeLibActivity : AppCompatActivity(), DefaultHardwareBackBtnHandler {

    private var reactSurface: ReactSurface? = null

    var onPopRequested: (() -> Unit)? = null

    @Volatile private var backEnabled: Boolean = true

    fun setBackEnabled(enabled: Boolean) {
        backEnabled = enabled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // edge-to-edge 레이아웃 활성화 → 시스템 window inset이 뷰 계층을 통해
        // RN SafeAreaProvider까지 전달되어 SafeAreaView가 올바른 padding을 계산함
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val moduleName = intent.getStringExtra(EXTRA_MODULE_NAME)
            ?: throw IllegalArgumentException(
                "BridgeLibActivity: 'bridge_lib_module_name' extra가 필요합니다."
            )
        val initialProps = intent.getBundleExtra(EXTRA_INITIAL_PROPS)

        val host = BridgeLibHost.getReactHost()
        val surface = host.createSurface(this, moduleName, initialProps)
        reactSurface = surface
        surface.start()

        val surfaceView = checkNotNull(surface.view) { "ReactSurface.view가 null입니다." }
        setContentView(surfaceView)

        // AppCompatActivity의 sub-decor(FitWindowsLinearLayout)가 fitsSystemWindows=true로
        // paddingTop을 추가해 ReactSurfaceView를 y=statusBarHeight에 위치시킨다.
        // setDecorFitsSystemWindows(false)는 Window 레벨만 처리하므로 sub-decor는 미처리된다.
        // surfaceView와 DecorView 사이 모든 부모 뷰의 fitsSystemWindows를 제거해 y=0 배치를 보장한다.
        surfaceView.doOnAttach { view ->
            var v: View? = view.parent as? View
            while (v != null && v !== window.decorView) {
                v.fitsSystemWindows = false
                v.setPadding(0, 0, 0, 0)
                v = v.parent as? View
            }
        }

        // Fabric이 layout()을 완료한 뒤 draw가 발생해야 SafeAreaProvider의 onPreDraw가 실행된다.
        // 자식 뷰가 마운트된 첫 global layout 이후 postInvalidate()로 draw를 유도한다.
        surfaceView.viewTreeObserver.addOnGlobalLayoutListener(
            object : ViewTreeObserver.OnGlobalLayoutListener {
                override fun onGlobalLayout() {
                    if ((surfaceView as? ViewGroup)?.childCount ?: 0 > 0) {
                        surfaceView.viewTreeObserver
                            .takeIf { it.isAlive }
                            ?.removeOnGlobalLayoutListener(this)
                        surfaceView.postInvalidate()
                    }
                }
            }
        )

        BridgeEventBus.setPopToNativeCallback { onPopRequested?.invoke() ?: finish() }
    }

    override fun invokeDefaultOnBackPressed() {
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!backEnabled) return
        BridgeLibHost.getReactHost().onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        BridgeLibHost.getReactHost().onHostResume(this, this)
    }

    override fun onPause() {
        super.onPause()
        BridgeLibHost.getReactHost().onHostPause(this)
    }

    override fun onDestroy() {
        BridgeEventBus.setPopToNativeCallback(null)
        reactSurface?.stop()
        BridgeLibHost.getReactHost().onHostDestroy(this)
        reactSurface = null
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
