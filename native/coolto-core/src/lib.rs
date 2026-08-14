use std::collections::HashSet;

use napi_derive::napi;

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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn quality_score_uses_protected_weights() {
    assert_eq!(weighted_quality_score(1.0, 0.5, 0.5, 1.0), 0.775);
  }

  #[test]
  fn similarity_handles_cjk_and_punctuation() {
    assert_eq!(bullet_similarity("提升转化率 20%".into(), "提升转化率20".into()), 1.0);
    assert!(bullet_similarity("abcdef".into(), "abcxyz".into()) > 0.0);
  }
}
