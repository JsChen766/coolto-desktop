fn main() {
  napi_build::setup();
  println!("cargo:rerun-if-env-changed=COOLTO_MAIN_KEY_HEX");
  let key = std::env::var("COOLTO_MAIN_KEY_HEX").unwrap_or_else(|_| {
    "6f39a112935327f3224d2a90c37ba03d8dcd835247660458001dfaae245a0f2f".into()
  });
  assert!(
    key.len() == 64 && key.bytes().all(|byte| byte.is_ascii_hexdigit()),
    "COOLTO_MAIN_KEY_HEX must be a 32-byte hexadecimal key"
  );
  println!("cargo:rustc-env=COOLTO_MAIN_KEY_HEX={key}");
}
