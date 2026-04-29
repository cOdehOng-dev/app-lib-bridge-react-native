package com.bridgelib

import android.app.Application
import android.content.pm.ApplicationInfo
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
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

        val isDebug = bundleConfig.isDebug
            ?: (application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)

        SoLoader.init(application, OpenSourceMergedSoMapping)

        reactHost = DefaultReactHost.getDefaultReactHost(
            context = application,
            packageList = packages + listOf(BridgeLibPackage()),
            jsMainModulePath = jsMainModulePath,
            jsBundleAssetPath = if (isDebug) null else bundleConfig.assetPath,
            jsBundleFilePath = bundleConfig.localBundlePath
        )
    }

    fun getReactHost(): ReactHost = reactHost
        ?: throw IllegalStateException(
            "BridgeLibHost가 초기화되지 않았습니다. Application.onCreate()에서 BridgeLibHost.init()을 호출하세요."
        )
}
