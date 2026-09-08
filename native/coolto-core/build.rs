fn main() {
  napi_build::setup();
  build_calendar_bridge();
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

fn build_calendar_bridge() {
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
    return;
  }
  let architecture = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
    Ok("aarch64") => "arm64",
    Ok("x86_64") => "x86_64",
    _ => panic!("unsupported macOS Calendar architecture"),
  };
  let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
  let object = output.join("calendar_bridge.o");
  let archive = output.join("libcoolto_calendar_bridge.a");
  run("xcrun", &[
    "--sdk", "macosx", "clang", "-arch", architecture,
    "-mmacosx-version-min=12.0", "-fobjc-arc", "-fblocks", "-c",
    "src/calendar_bridge.m", "-o", object.to_str().unwrap(),
  ]);
  run("xcrun", &[
    "--sdk", "macosx", "ar", "rcs", archive.to_str().unwrap(),
    object.to_str().unwrap(),
  ]);
  println!("cargo:rustc-link-search=native={}", output.display());
  println!("cargo:rustc-link-lib=static=coolto_calendar_bridge");
  let clang_resource = command_output("xcrun", &[
    "--sdk", "macosx", "clang", "--print-resource-dir",
  ]);
  let clang_runtime = std::path::PathBuf::from(clang_resource).join("lib/darwin");
  println!("cargo:rustc-link-search=native={}", clang_runtime.display());
  println!("cargo:rustc-link-lib=static=clang_rt.osx");
  println!("cargo:rustc-link-lib=framework=EventKit");
  println!("cargo:rustc-link-lib=framework=Foundation");
  println!("cargo:rerun-if-changed=src/calendar_bridge.m");
}

fn command_output(command: &str, arguments: &[&str]) -> String {
  let output = std::process::Command::new(command)
    .args(arguments)
    .output()
    .unwrap_or_else(|error| panic!("failed to run {command}: {error}"));
  assert!(output.status.success(), "{command} failed with {}", output.status);
  String::from_utf8(output.stdout)
    .expect("command output must be UTF-8")
    .trim()
    .into()
}

fn run(command: &str, arguments: &[&str]) {
  let status = std::process::Command::new(command)
    .args(arguments)
    .status()
    .unwrap_or_else(|error| panic!("failed to run {command}: {error}"));
  assert!(status.success(), "{command} failed with {status}");
}
