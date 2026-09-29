#include <node_api.h>

#include <string>

#import <Foundation/Foundation.h>

#import "AppleVisionBridge-Swift.h"

namespace {

/// One call from Swift. Snapshots and the completion share one threadsafe
/// function, so JavaScript receives them in the order that Swift sends them.
struct PromiseEvent {
  bool isSnapshot;
  NSString* error;
  NSString* value;
};

/// The threadsafe function context is the promise deferred. Settling the
/// promise frees it, so the function needs no finalizer.
void callPromiseJavaScript(napi_env env, napi_value snapshotCallback, void* context, void* data) {
  auto deferred = static_cast<napi_deferred>(context);
  auto* result = static_cast<PromiseEvent*>(data);

  if (env != nullptr) {
    if (result->isSnapshot) {
      if (snapshotCallback != nullptr) {
        napi_value text;
        napi_value receiver;
        napi_create_string_utf8(env, result->value.UTF8String, NAPI_AUTO_LENGTH, &text);
        napi_get_undefined(env, &receiver);
        napi_call_function(env, receiver, snapshotCallback, 1, &text, nullptr);
      }
    } else if (result->error != nil) {
      napi_value message;
      napi_value error;
      napi_create_string_utf8(
          env,
          result->error.UTF8String,
          NAPI_AUTO_LENGTH,
          &message);
      napi_create_error(env, nullptr, message, &error);
      napi_reject_deferred(env, deferred, error);
    } else {
      napi_value value;
      napi_create_string_utf8(
          env,
          result->value.UTF8String,
          NAPI_AUTO_LENGTH,
          &value);
      napi_resolve_deferred(env, deferred, value);
    }
  }

  delete result;
}

/// Creates a promise and the threadsafe function that settles it.
/// `snapshotCallback` can be nullptr. It receives the text of each snapshot.
napi_value createPromise(napi_env env, napi_value snapshotCallback, napi_threadsafe_function* function) {
  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);

  napi_value resourceName;
  napi_create_string_utf8(
      env,
      "xsai-apple-vision-promise",
      NAPI_AUTO_LENGTH,
      &resourceName);
  napi_create_threadsafe_function(
      env,
      snapshotCallback,
      nullptr,
      resourceName,
      0,
      1,
      nullptr,
      nullptr,
      deferred,
      callPromiseJavaScript,
      function);
  return promise;
}

void sendSnapshot(napi_threadsafe_function function, NSString* text) {
  auto* event = new PromiseEvent{true, nil, [text copy]};
  napi_call_threadsafe_function(function, event, napi_tsfn_nonblocking);
}

void complete(napi_threadsafe_function function, NSString* value, NSString* error) {
  auto* result = new PromiseEvent{false, [error copy], [value copy]};
  napi_call_threadsafe_function(function, result, napi_tsfn_nonblocking);
  napi_release_threadsafe_function(function, napi_tsfn_release);
}

bool readString(napi_env env, napi_value value, std::string& output) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok)
    return false;
  output.resize(length);
  size_t written = 0;
  napi_get_value_string_utf8(env, value, output.data(), length + 1, &written);
  return true;
}

/// Copies an array of Node.js Buffers into NSData values.
bool readBuffers(napi_env env, napi_value value, NSMutableArray<NSData*>* output) {
  bool isArray = false;
  if (napi_is_array(env, value, &isArray) != napi_ok || !isArray)
    return false;
  uint32_t length = 0;
  napi_get_array_length(env, value, &length);
  for (uint32_t index = 0; index < length; index++) {
    napi_value element;
    napi_get_element(env, value, index, &element);
    bool isBuffer = false;
    if (napi_is_buffer(env, element, &isBuffer) != napi_ok || !isBuffer)
      return false;
    void* bytes = nullptr;
    size_t byteLength = 0;
    napi_get_buffer_info(env, element, &bytes, &byteLength);
    [output addObject:[NSData dataWithBytes:bytes length:byteLength]];
  }
  return true;
}

napi_value isAvailable(napi_env env, napi_callback_info) {
  napi_threadsafe_function function;
  napi_value promise = createPromise(env, nullptr, &function);
  if (@available(macOS 27.0, *)) {
    [AppleVisionBridge isAvailableWithCompletion:^(NSString* value, NSString* error) {
      complete(function, value, error);
    }];
  } else {
    complete(
        function,
        @"{\"available\":false,\"reason\":{\"code\":\"framework-unavailable\",\"message\":\"Apple Vision requires macOS 27 or later.\"}}",
        nil);
  }
  return promise;
}

napi_value prepareOCR(napi_env env, napi_callback_info) {
  napi_threadsafe_function function;
  napi_value promise = createPromise(env, nullptr, &function);
  if (@available(macOS 27.0, *)) {
    [AppleVisionBridge prepareOCRWithCompletion:^(NSString* value, NSString* error) {
      complete(function, value, error);
    }];
  } else {
    complete(function, nil, @"Apple Vision requires macOS 27 or later.");
  }
  return promise;
}

napi_value supportedLanguages(napi_env env, napi_callback_info) {
  napi_threadsafe_function function;
  napi_value promise = createPromise(env, nullptr, &function);
  if (@available(macOS 27.0, *)) {
    [AppleVisionBridge supportedLanguagesWithCompletion:^(NSString* value, NSString* error) {
      complete(function, value, error);
    }];
  } else {
    complete(function, @"[]", nil);
  }
  return promise;
}

napi_value supportsLanguage(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value argument;
  napi_get_cb_info(env, info, &argumentCount, &argument, nullptr, nullptr);
  std::string identifier;
  if (argumentCount != 1 || !readString(env, argument, identifier)) {
    napi_throw_type_error(env, nullptr, "supportsLanguage expects a language identifier.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, nullptr, &function);
  if (@available(macOS 27.0, *)) {
    [AppleVisionBridge
        supportsLanguageWithIdentifier:[NSString stringWithUTF8String:identifier.c_str()]
                            completion:^(NSString* value, NSString* error) {
                              complete(function, value, error);
                            }];
  } else {
    complete(function, @"false", nil);
  }
  return promise;
}

napi_value cancelAnswer(napi_env env, napi_callback_info info) {
  void* task = nullptr;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &task);
  if (@available(macOS 27.0, *)) {
    [(__bridge AppleVisionTask*)task cancel];
  }
  return nullptr;
}

void releaseTask(napi_env, void* task, void*) {
  // Older systems create no task.
  if (task != nullptr)
    CFBridgingRelease(task);
}

/// Returns `{ result, cancel }`. `cancel` keeps the Swift task alive until it is collected.
napi_value answerHandle(napi_env env, napi_value promise, void* retainedTask) {
  napi_value handle;
  napi_value cancel;
  napi_create_object(env, &handle);
  napi_create_function(env, "cancel", NAPI_AUTO_LENGTH, cancelAnswer, retainedTask, &cancel);
  napi_add_finalizer(env, cancel, retainedTask, releaseTask, nullptr, nullptr);
  napi_set_named_property(env, handle, "result", promise);
  napi_set_named_property(env, handle, "cancel", cancel);
  return handle;
}

napi_value respond(napi_env env, napi_callback_info info) {
  size_t argumentCount = 3;
  napi_value arguments[3];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string requestJSON;
  NSMutableArray<NSData*>* images = [NSMutableArray array];
  napi_valuetype callbackType = napi_undefined;
  if (argumentCount == 3)
    napi_typeof(env, arguments[2], &callbackType);
  if (argumentCount < 2
      || !readString(env, arguments[0], requestJSON)
      || !readBuffers(env, arguments[1], images)
      || (callbackType != napi_undefined && callbackType != napi_function)) {
    napi_throw_type_error(
        env,
        nullptr,
        "respond expects request JSON, an array of Buffers, and an optional snapshot function.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(
      env,
      callbackType == napi_function ? arguments[2] : nullptr,
      &function);
  void* retainedTask = nullptr;
  if (@available(macOS 27.0, *)) {
    AppleVisionTask* task = [AppleVisionBridge
        respondWithRequestJSON:[NSString stringWithUTF8String:requestJSON.c_str()]
                        images:images
                      snapshot:^(NSString* text) {
                        sendSnapshot(function, text);
                      }
                    completion:^(NSString* value, NSString* error) {
                      complete(function, value, error);
                    }];
    retainedTask = (void*)CFBridgingRetain(task);
  } else {
    complete(function, nil, @"Apple Vision requires macOS 27 or later.");
  }
  return answerHandle(env, promise, retainedTask);
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"isAvailable", nullptr, isAvailable, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"respond", nullptr, respond, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"prepareOCR", nullptr, prepareOCR, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"supportedLanguages", nullptr, supportedLanguages, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"supportsLanguage", nullptr, supportsLanguage, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 5, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
