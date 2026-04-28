#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

RCT_EXTERN_MODULE(NativeBridgeModule, RCTEventEmitter)
RCT_EXTERN_METHOD(sendEvent:(NSString *)name data:(NSDictionary *)data)
