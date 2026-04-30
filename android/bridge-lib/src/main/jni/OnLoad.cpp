/*
 * Minimal appmodules entry point for AAR distribution.
 *
 * Sets javaModuleProvider so DefaultTurboModuleManagerDelegate can resolve
 * core Java TurboModules (DeviceInfo, AppState, etc.) via FBReactNativeSpec.
 * Does NOT link against autolinking libraries — keeps libappmodules.so lean
 * so it can be shipped inside an AAR without requiring libreact_codegen_rnscreens.so etc.
 */

#include <DefaultTurboModuleManagerDelegate.h>
#include <FBReactNativeSpec.h>
#include <fbjni/fbjni.h>

namespace facebook::react {

std::shared_ptr<TurboModule> javaModuleProvider(
    const std::string& name,
    const JavaTurboModule::InitParams& params) {
  return FBReactNativeSpec_ModuleProvider(name, params);
}

} // namespace facebook::react

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
        &facebook::react::javaModuleProvider;
  });
}
