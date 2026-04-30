package com.bridgelib

import android.app.Application
import android.content.pm.ApplicationInfo
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

object BridgeLibHost {

    @Volatile
    private var reactHost: ReactHost? = null

    fun init(
        application: Application,
        bundleConfig: BundleConfig = BundleConfig(),
        packages: List<ReactPackage> = emptyList(),
        jsMainModulePath: String = "index"
    ) {
        if (reactHost != null) return
        synchronized(this) {
            if (reactHost != null) return

            val isDebug = bundleConfig.isDebug
                ?: (application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)

            SoLoader.init(application, OpenSourceMergedSoMapping)

            // javaModuleProvider C++ 함수 포인터를 설정하는 SO.
            // 이 포인터가 null이면 DeviceInfo 등 코어 Java TurboModule이 모두 실패한다.
            // 호스트 앱이 이미 로드했다면 no-op이므로 안전하게 항상 호출한다.
            SoLoader.loadLibrary("appmodules")

            // ReactNativeFeatureFlags를 초기화하고 react_newarchdefaults SO를 로드한다.
            // 소비 앱이 이미 호출했을 경우(fabricEnabled == true)는 skip.
            if (!DefaultNewArchitectureEntryPoint.fabricEnabled) {
                DefaultNewArchitectureEntryPoint.load()
            }

            reactHost = DefaultReactHost.getDefaultReactHost(
                context = application,
                packageList = listOf(MainReactPackage()) + packages + listOf(BridgeLibPackage()),
                jsMainModulePath = jsMainModulePath,
                jsBundleAssetPath = bundleConfig.assetPath,
                jsBundleFilePath = bundleConfig.localBundlePath,
                useDevSupport = isDebug
            )
        }
    }

    fun getReactHost(): ReactHost = reactHost
        ?: throw IllegalStateException(
            "BridgeLibHost가 초기화되지 않았습니다. Application.onCreate()에서 BridgeLibHost.init()을 호출하세요."
        )
}
