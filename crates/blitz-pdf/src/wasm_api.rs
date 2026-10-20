use wasm_bindgen::prelude::*;

fn parse_options(options: JsValue) -> Result<super::Options, JsError> {
    serde_wasm_bindgen::from_value(options)
        .map_err(|error| JsError::new(&format!("Invalid render options: {error}")))
}

fn failure(error: String) -> JsError {
    JsError::new(&error)
}

#[wasm_bindgen]
pub fn render_pdf(html: &str, options: JsValue) -> Result<Vec<u8>, JsError> {
    let mut job = super::RenderJob::build(html, parse_options(options)?, false).map_err(failure)?;
    job.advance().map_err(failure)?;
    job.render().map_err(failure)
}

/// JavaScript view of a document retained across asynchronous resource loads.
#[wasm_bindgen]
pub struct RenderJob {
    inner: super::RenderJob,
}

#[wasm_bindgen]
impl RenderJob {
    #[wasm_bindgen(constructor)]
    pub fn new(html: &str, options: JsValue) -> Result<RenderJob, JsError> {
        super::RenderJob::build(html, parse_options(options)?, true)
            .map(|inner| Self { inner })
            .map_err(failure)
    }

    /// Advance style/layout until it needs external data, or is ready to paint.
    pub fn pending_assets(&mut self) -> Result<Vec<String>, JsError> {
        self.inner.advance().map_err(failure)
    }

    pub fn provide_asset(&mut self, url: &str, bytes: Vec<u8>) -> Result<(), JsError> {
        self.inner.provide(url, bytes).map_err(failure)
    }

    pub fn finish(&mut self) -> Result<Vec<u8>, JsError> {
        self.inner.render().map_err(failure)
    }
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    super::engine_version()
}
