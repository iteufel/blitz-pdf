//! Node-API entry points for Node.js and Bun. Render jobs stay on the calling
//! thread: the DOM is not `Send`, and JavaScript resumes each job by id.
use std::{cell::RefCell, collections::HashMap};

use napi::{
    ValueType,
    bindgen_prelude::{
        Buffer, Env, Error, FromNapiValue, Result, TypeName, Unknown, ValidateNapiValue,
    },
    sys,
};
use napi_derive::napi;

pub(crate) struct ParsedOptions(super::Options);

impl FromNapiValue for ParsedOptions {
    unsafe fn from_napi_value(env: sys::napi_env, napi_val: sys::napi_value) -> Result<Self> {
        let unknown = unsafe { Unknown::from_napi_value(env, napi_val)? };
        let options = Env::from_raw(env).from_js_value(unknown).map_err(|error| {
            Error::from_reason(format!("Invalid render options: {}", error.reason))
        })?;
        Ok(Self(options))
    }
}

impl TypeName for ParsedOptions {
    fn type_name() -> &'static str {
        "object"
    }

    fn value_type() -> ValueType {
        ValueType::Object
    }
}

impl ValidateNapiValue for ParsedOptions {}

struct Jobs {
    next: u32,
    jobs: HashMap<u32, super::RenderJob>,
}

thread_local! {
    static JOBS: RefCell<Jobs> = RefCell::new(Jobs { next: 1, jobs: HashMap::new() });
}

fn failure(error: String) -> Error {
    Error::from_reason(error)
}

fn insert_job(job: super::RenderJob) -> u32 {
    JOBS.with(|slot| {
        let mut state = slot.borrow_mut();
        loop {
            let id = state.next;
            state.next = state.next.wrapping_add(1);
            if id == 0 {
                continue;
            }
            if let std::collections::hash_map::Entry::Vacant(entry) = state.jobs.entry(id) {
                entry.insert(job);
                return id;
            }
        }
    })
}

fn with_job<T>(id: u32, update: impl FnOnce(&mut super::RenderJob) -> Result<T>) -> Result<T> {
    JOBS.with(|slot| {
        let mut state = slot.borrow_mut();
        let job = state
            .jobs
            .get_mut(&id)
            .ok_or_else(|| Error::from_reason("Render job is no longer available"))?;
        update(job)
    })
}

#[napi(js_name = "render_pdf")]
pub fn render_pdf(html: String, options: ParsedOptions) -> Result<Buffer> {
    let mut job = super::RenderJob::build(&html, options.0, false).map_err(failure)?;
    job.advance().map_err(failure)?;
    job.render().map(Buffer::from).map_err(failure)
}

#[napi(js_name = "engine_version")]
pub fn engine_version() -> String {
    super::engine_version()
}

#[napi(js_name = "job_new")]
pub fn job_new(html: String, options: ParsedOptions) -> Result<u32> {
    super::RenderJob::build(&html, options.0, true)
        .map(insert_job)
        .map_err(failure)
}

#[napi(js_name = "job_pending_assets")]
pub fn job_pending_assets(id: u32) -> Result<Vec<String>> {
    with_job(id, |job| job.advance().map_err(failure))
}

#[napi(js_name = "job_provide_asset")]
pub fn job_provide_asset(id: u32, url: String, bytes: Buffer) -> Result<()> {
    let data = bytes.to_vec();
    with_job(id, |job| job.provide(&url, data).map_err(failure))
}

#[napi(js_name = "job_finish")]
pub fn job_finish(id: u32) -> Result<Buffer> {
    with_job(id, |job| job.render().map(Buffer::from).map_err(failure))
}

#[napi(js_name = "job_free")]
pub fn job_free(id: u32) {
    if id == 0 {
        return;
    }
    JOBS.with(|slot| {
        slot.borrow_mut().jobs.remove(&id);
    });
}
