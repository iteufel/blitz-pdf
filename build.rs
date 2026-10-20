fn main() {
    // Host Node-API builds need the link flags. The wasm feature does not.
    #[cfg(feature = "napi")]
    napi_build::setup();
}
