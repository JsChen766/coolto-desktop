use std::collections::HashSet;

use aes_gcm::{
  Aes256Gcm, Nonce,
  aead::{Aead, KeyInit},
};
use napi::{
  Env, Error, Result, Status,
  bindgen_prelude::{Buffer, Unknown},
};
use napi_derive::napi;

const PAYLOAD_MAGIC: &[u8; 8] = b"CLTOENC1";
const NONCE_LENGTH: usize = 12;

#[napi(js_name = "runProtectedMain")]
pub fn run_protected_main(env: Env, payload: Buffer, context_key: String) -> Result<()> {
  if context_key.len() > 64
    || !context_key
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
  {
    return Err(protection_error("受保护主进程上下文无效"));
  }
  let plaintext = decrypt_payload(&payload)?;
  let source = String::from_utf8(plaintext)
    .map_err(|_| protection_error("受保护主进程不是有效 UTF-8"))?;
  let script = format!(
    "const c=globalThis[\"{context_key}\"];if(!c)throw new Error(\"protected context missing\");(function(exports,require,module,__filename,__dirname){{{source}\n}}).call(c.module.exports,c.module.exports,c.require,c.module,c.filename,c.dirname);"
  );
  let _: Unknown = env.run_script(script)?;
  Ok(())
}

fn decrypt_payload(payload: &[u8]) -> Result<Vec<u8>> {
  let header_length = PAYLOAD_MAGIC.len() + NONCE_LENGTH;
  if payload.len() <= header_length || &payload[..PAYLOAD_MAGIC.len()] != PAYLOAD_MAGIC {
    return Err(protection_error("受保护主进程载荷格式无效"));
  }
  let key = decode_key()?;
  let cipher = Aes256Gcm::new_from_slice(&key)
    .map_err(|_| protection_error("原生保护密钥无效"))?;
  let nonce = Nonce::from_slice(&payload[PAYLOAD_MAGIC.len()..header_length]);
  let plaintext = cipher
    .decrypt(nonce, &payload[header_length..])
    .map_err(|_| protection_error("受保护主进程载荷校验失败"))?;
  Ok(plaintext)
}

#[napi(js_name = "weightedQualityScore")]
pub fn weighted_quality_score(
  weighted_jd_coverage: f64,
  must_have_coverage: f64,
  evidence_specificity: f64,
  information_diversity: f64,
) -> f64 {
  round4(
    weighted_jd_coverage * 0.35
      + must_have_coverage * 0.30
      + evidence_specificity * 0.15
      + information_diversity * 0.20,
  )
}

#[napi(js_name = "bulletSimilarity")]
pub fn bullet_similarity(left: String, right: String) -> f64 {
  let normalized_left = normalize(&left);
  let normalized_right = normalize(&right);
  if normalized_left.is_empty() || normalized_right.is_empty() {
    return 0.0;
  }
  if normalized_left == normalized_right {
    return 1.0;
  }
  let left_grams = ngrams(&normalized_left, 3);
  let right_grams = ngrams(&normalized_right, 3);
  let intersection = left_grams.intersection(&right_grams).count();
  let union = left_grams.union(&right_grams).count();
  if union == 0 {
    0.0
  } else {
    intersection as f64 / union as f64
  }
}

fn normalize(value: &str) -> Vec<char> {
  value
    .chars()
    .flat_map(char::to_lowercase)
    .filter(|character| character.is_alphanumeric())
    .collect()
}

fn ngrams(value: &[char], size: usize) -> HashSet<String> {
  if value.len() <= size {
    return HashSet::from([value.iter().collect()]);
  }
  value
    .windows(size)
    .map(|window| window.iter().collect())
    .collect()
}

fn round4(value: f64) -> f64 {
  (value * 10_000.0).round() / 10_000.0
}

fn decode_key() -> Result<[u8; 32]> {
  let encoded = env!("COOLTO_MAIN_KEY_HEX").as_bytes();
  let mut key = [0_u8; 32];
  for (index, pair) in encoded.chunks_exact(2).enumerate() {
    key[index] = (hex_digit(pair[0])? << 4) | hex_digit(pair[1])?;
  }
  Ok(key)
}

fn hex_digit(value: u8) -> Result<u8> {
  match value {
    b'0'..=b'9' => Ok(value - b'0'),
    b'a'..=b'f' => Ok(value - b'a' + 10),
    b'A'..=b'F' => Ok(value - b'A' + 10),
    _ => Err(protection_error("原生保护密钥格式无效")),
  }
}

fn protection_error(reason: &str) -> Error {
  Error::new(Status::InvalidArg, reason)
}

#[cfg(test)]
mod tests {
  use super::*;
  use aes_gcm::aead::Aead;

  #[test]
  fn quality_score_uses_protected_weights() {
    assert_eq!(weighted_quality_score(1.0, 0.5, 0.5, 1.0), 0.775);
  }

  #[test]
  fn similarity_handles_cjk_and_punctuation() {
    assert_eq!(bullet_similarity("提升转化率 20%".into(), "提升转化率20".into()), 1.0);
    assert!(bullet_similarity("abcdef".into(), "abcxyz".into()) > 0.0);
  }

  #[test]
  fn protected_main_requires_valid_authenticated_ciphertext() {
    let key = decode_key().unwrap();
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let nonce = Nonce::from_slice(&[7_u8; NONCE_LENGTH]);
    let ciphertext = cipher.encrypt(nonce, b"module.exports = 1".as_slice()).unwrap();
    let mut payload = Vec::from(PAYLOAD_MAGIC);
    payload.extend_from_slice(nonce);
    payload.extend_from_slice(&ciphertext);
    let decrypted = decrypt_payload(&payload).unwrap();
    assert_eq!(&decrypted, b"module.exports = 1");

    let mut tampered = Vec::from(PAYLOAD_MAGIC);
    tampered.extend_from_slice(nonce);
    tampered.extend_from_slice(&ciphertext);
    *tampered.last_mut().unwrap() ^= 1;
    assert!(decrypt_payload(&tampered).is_err());
  }
}
