#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MateyIOSFileBridge, "MateyIOSFileBridge",
           CAP_PLUGIN_LOCALIZED_DESCRIPTION("Native iOS file system bridge for Matey Agent using sandbox documents directory")
           )

CAP_PLUGIN_METHOD(readFile, CAPPluginCallTransformer);
CAP_PLUGIN_METHOD(writeFile, CAPPluginCallTransformer);
CAP_PLUGIN_METHOD(listFiles, CAPPluginCallTransformer);
CAP_PLUGIN_METHOD(deleteFile, CAPPluginCallTransformer);
