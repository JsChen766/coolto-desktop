use napi::{Error, Result, Status, Task, bindgen_prelude::AsyncTask};
use napi_derive::napi;

#[cfg(target_os = "macos")]
use std::ffi::{CStr, CString, c_char};

#[cfg(target_os = "macos")]
unsafe extern "C" {
  fn coolto_calendar_authorization_status() -> i32;
  fn coolto_calendar_request_access(full_access: i32) -> *mut c_char;
  fn coolto_calendar_create_event(input: *const c_char) -> *mut c_char;
  fn coolto_calendar_update_event(input: *const c_char) -> *mut c_char;
  fn coolto_calendar_cancel_event(identifier: *const c_char) -> *mut c_char;
  fn coolto_calendar_free(value: *mut c_char);
}

#[napi(js_name = "calendarAuthorizationStatus")]
pub fn calendar_authorization_status() -> String {
  #[cfg(target_os = "macos")]
  unsafe {
    return status_label(coolto_calendar_authorization_status()).into();
  }
  #[cfg(not(target_os = "macos"))]
  "unavailable".into()
}

#[napi(js_name = "calendarRequestAccess")]
pub fn calendar_request_access(level: String) -> Result<AsyncTask<CalendarTask>> {
  let full_access = match level.as_str() {
    "write_only" => false,
    "full_access" => true,
    _ => return Err(calendar_error("Calendar 权限级别无效")),
  };
  Ok(AsyncTask::new(CalendarTask::RequestAccess(full_access)))
}

#[napi(js_name = "calendarCreateEvent")]
pub fn calendar_create_event(input: String) -> AsyncTask<CalendarTask> {
  AsyncTask::new(CalendarTask::Create(input))
}

#[napi(js_name = "calendarUpdateEvent")]
pub fn calendar_update_event(input: String) -> AsyncTask<CalendarTask> {
  AsyncTask::new(CalendarTask::Update(input))
}

#[napi(js_name = "calendarCancelEvent")]
pub fn calendar_cancel_event(identifier: String) -> AsyncTask<CalendarTask> {
  AsyncTask::new(CalendarTask::Cancel(identifier))
}

pub enum CalendarTask {
  RequestAccess(bool),
  Create(String),
  Update(String),
  Cancel(String),
}

impl Task for CalendarTask {
  type Output = String;
  type JsValue = String;

  fn compute(&mut self) -> Result<Self::Output> {
    #[cfg(target_os = "macos")]
    unsafe {
      return match self {
        Self::RequestAccess(full) => owned_json(
          coolto_calendar_request_access(i32::from(*full)),
        ),
        Self::Create(input) => with_input(input, coolto_calendar_create_event),
        Self::Update(input) => with_input(input, coolto_calendar_update_event),
        Self::Cancel(identifier) => with_input(identifier, coolto_calendar_cancel_event),
      };
    }
    #[cfg(not(target_os = "macos"))]
    Err(calendar_error("当前设备不支持 macOS Calendar"))
  }

  fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> Result<Self::JsValue> {
    Ok(output)
  }
}

#[cfg(target_os = "macos")]
unsafe fn with_input(
  value: &str,
  action: unsafe extern "C" fn(*const c_char) -> *mut c_char,
) -> Result<String> {
  let input = CString::new(value).map_err(|_| calendar_error("Calendar 输入包含空字符"))?;
  owned_json(unsafe { action(input.as_ptr()) })
}

#[cfg(target_os = "macos")]
unsafe fn owned_json(value: *mut c_char) -> Result<String> {
  if value.is_null() return Err(calendar_error("EventKit 未返回结果"));
  let output = unsafe { CStr::from_ptr(value) }.to_string_lossy().into_owned();
  unsafe { coolto_calendar_free(value) };
  Ok(output)
}

#[cfg(target_os = "macos")]
fn status_label(value: i32) -> &'static str {
  match value {
    0 => "not_determined",
    1 => "restricted",
    2 => "denied",
    3 => "write_only",
    4 => "full_access",
    _ => "unavailable",
  }
}

fn calendar_error(message: &str) -> Error {
  Error::new(Status::GenericFailure, message)
}
