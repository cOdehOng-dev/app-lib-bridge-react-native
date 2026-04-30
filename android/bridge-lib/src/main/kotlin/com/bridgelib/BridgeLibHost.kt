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

            // consumer 프로젝트의 autolinking 패키지를 자동으로 포함한다.
            // PackageList는 consumer 빌드 시 생성되므로 리플렉션으로 런타임에 조회한다.
            // AAR 빌드 환경에서는 클래스가 없으므로 예외 시 빈 리스트로 폴백한다.
            val autolinkedPackages = resolveAutolinkedPackages(application)

            reactHost = DefaultReactHost.getDefaultReactHost(
                context = application,
                packageList = listOf(MainReactPackage()) + autolinkedPackages + listOf(BridgeLibPackage()),
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

    @Suppress("UNCHECKED_CAST")
    private fun resolveAutolinkedPackages(application: Application): List<ReactPackage> {
        return try {
            val clazz = Class.forName("com.facebook.react.PackageList")
            val instance = clazz.getConstructor(Application::class.java).newInstance(application)
            clazz.getMethod("getPackages").invoke(instance) as List<ReactPackage>
        } catch (_: Exception) {
            emptyList()
        }
    }
}
