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

            // autolinking 패키지: PackageList는 consumer 빌드 시 생성되므로 리플렉션으로 조회한다.
            // 순수 네이티브 앱 등 PackageList가 없는 환경에서는 빈 리스트로 폴백한다.
            val autolinkedPackages = resolveAutolinkedPackages(application)

            reactHost = DefaultReactHost.getDefaultReactHost(
                context = application,
                packageList = listOf(MainReactPackage()) + autolinkedPackages + packages + listOf(BridgeLibPackage()),
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
        // 1순위: autolinking RN 프로젝트 — PackageList 리플렉션
        try {
            val clazz = Class.forName("com.facebook.react.PackageList")
            val instance = clazz.getConstructor(Application::class.java).newInstance(application)
            val packages = clazz.getMethod("getPackages").invoke(instance) as List<ReactPackage>
            if (packages.isNotEmpty()) return packages
        } catch (_: Exception) { }

        // 2순위: 순수 네이티브 앱 — 클래스명으로 직접 인스턴스화
        // publish:android 실행 시 각 패키지가 com.npm.rn:<pkg>:<ver> 로 로컬 Maven에 배포된다.
        // 소비앱 build.gradle.kts에 해당 의존성이 추가되면 classpath에서 찾아 자동 등록된다.
        return KNOWN_RN_PACKAGE_CLASSES.mapNotNull { className ->
            try {
                Class.forName(className).getConstructor().newInstance() as ReactPackage
            } catch (_: Exception) {
                null
            }
        }
    }

    // publish:android 로 배포된 autolinking 패키지의 클래스명 목록.
    // 소비앱 classpath에 존재하는 것만 자동 등록되고 없으면 조용히 스킵된다.
    private val KNOWN_RN_PACKAGE_CLASSES = listOf(
        "com.th3rdwave.safeareacontext.SafeAreaContextPackage",
        "com.swmansion.gesturehandler.RNGestureHandlerPackage",
        "com.swmansion.rnscreens.RNScreensPackage",
        "com.oblador.vectoricons.VectorIconsPackage",
    )
}
