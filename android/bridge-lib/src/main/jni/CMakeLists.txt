cmake_minimum_required(VERSION 3.13)
project(appmodules)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)

add_library(appmodules SHARED OnLoad.cpp)

# folly/folly-config.h is a generated file not shipped in prefab headers.
# These flags replicate what react-native's folly-flags.cmake provides so
# folly headers skip the missing generated config and use compile-time defaults.
target_compile_options(appmodules PRIVATE
  -DFOLLY_NO_CONFIG=1
  -DFOLLY_HAVE_CLOCK_GETTIME=1
  -DFOLLY_USE_LIBCPP=1
  -DFOLLY_CFG_NO_COROUTINES=1
  -DFOLLY_MOBILE=1
  -DFOLLY_HAVE_RECVMMSG=1
  -DFOLLY_HAVE_PTHREAD=1
  -DFOLLY_HAVE_XSI_STRERROR_R=1
)

# Link ONLY against react-android prefab and fbjni.
# No autolinking libraries — prevents libreact_codegen_rnscreens.so etc.
# from becoming hard dynamic dependencies of libappmodules.so.
target_link_libraries(appmodules
  ReactAndroid::reactnative
  ReactAndroid::jsi
  fbjni::fbjni
)
