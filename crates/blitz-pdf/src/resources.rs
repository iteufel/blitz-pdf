use blitz_traits::net::{Bytes, NetHandler, NetProvider, Request};
use serde_bytes::ByteBuf;
use std::{
    collections::BTreeMap,
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

const MAX_REQUESTS: usize = 1024;
const MAX_RESOURCE_BYTES: usize = 64 * 1024 * 1024;

/// All resources are supplied by the caller. This provider cannot access the
/// network or filesystem, so behavior is identical in every JS runtime.
pub struct Resources {
    state: Mutex<State>,
    dynamic: bool,
    pub requests: AtomicUsize,
    errors: Mutex<Vec<String>>,
}

struct State {
    assets: BTreeMap<String, Bytes>,
    pending: BTreeMap<String, Vec<Box<dyn NetHandler>>>,
    total_bytes: usize,
}

impl Resources {
    pub fn new(assets: BTreeMap<String, ByteBuf>, dynamic: bool) -> Self {
        let total_bytes = assets.values().map(|bytes| bytes.len()).sum();
        Self {
            state: Mutex::new(State {
                assets: assets
                    .into_iter()
                    .map(|(url, bytes)| (url, Bytes::from(bytes.into_vec())))
                    .collect(),
                pending: BTreeMap::new(),
                total_bytes,
            }),
            dynamic,
            requests: AtomicUsize::new(0),
            errors: Mutex::new(Vec::new()),
        }
    }

    pub fn pending_urls(&self) -> Vec<String> {
        self.state.lock().unwrap().pending.keys().cloned().collect()
    }

    pub fn provide(&self, url: &str, bytes: Vec<u8>) -> Result<(), String> {
        let bytes = Bytes::from(bytes);
        let handlers = {
            let mut state = self.state.lock().unwrap();
            if !state.pending.contains_key(url) {
                return Err(format!("Asset was not requested: {url}"));
            }
            if bytes.len() > MAX_RESOURCE_BYTES - state.total_bytes {
                return Err("Assets exceed the 64 MiB limit".into());
            }
            state.total_bytes += bytes.len();
            state.assets.insert(url.to_string(), bytes.clone());
            state.pending.remove(url).unwrap()
        };
        // Parsing a stylesheet can request more assets. Release the lock first,
        // and cache the bytes before dispatching to coalesce duplicate requests.
        for handler in handlers {
            handler.bytes(url.to_string(), bytes.clone());
        }
        self.check()
    }

    pub fn clear_pending(&self) {
        // Stylesheet handlers own an Arc to this provider. Break that cycle when
        // a JS callback rejects and the render job is freed with requests pending.
        let pending = std::mem::take(&mut self.state.lock().unwrap().pending);
        drop(pending);
    }

    pub fn check(&self) -> Result<(), String> {
        let errors = self.errors.lock().unwrap();
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }
}

impl NetProvider for Resources {
    fn fetch(&self, _doc_id: usize, request: Request, handler: Box<dyn NetHandler>) {
        let count = self.requests.fetch_add(1, Ordering::Relaxed);
        if count >= MAX_REQUESTS {
            if count == MAX_REQUESTS {
                self.errors
                    .lock()
                    .unwrap()
                    .push("Too many resource requests (limit: 1024)".into());
            }
            return;
        }
        let url = request.url.to_string();
        let result = if request.url.scheme() == "data" {
            data_url::DataUrl::process(&url)
                .map_err(|_| "Invalid data URL".to_string())
                .and_then(|data| {
                    data.decode_to_vec()
                        .map(|(bytes, _)| Bytes::from(bytes))
                        .map_err(|_| "Invalid data URL encoding".to_string())
                })
        } else {
            let mut state = self.state.lock().unwrap();
            if let Some(bytes) = state.assets.get(&url) {
                Ok(bytes.clone())
            } else if self.dynamic {
                state.pending.entry(url).or_default().push(handler);
                return;
            } else {
                Err(format!(
                    "Missing asset: {url}. Supply it in options.assets or use a data URL"
                ))
            }
        };
        match result {
            Ok(bytes) if bytes.len() <= MAX_RESOURCE_BYTES => handler.bytes(url, bytes),
            Ok(_) => self
                .errors
                .lock()
                .unwrap()
                .push("Resource exceeds the 64 MiB limit".into()),
            Err(message) => self.errors.lock().unwrap().push(message),
        }
    }
}
