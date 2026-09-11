#pragma once
#include "clip.h"
#include "json.hpp"
#include "model_manifest.h"
#include <cmath>
#include <mutex>
#include <opencv2/imgproc.hpp>
#include <stdexcept>
#include <vector>
using json = nlohmann::json;
inline const json MODEL = json::parse(MODEL_MANIFEST);
using Vector = std::vector<float>;
inline void validate_vector(const Vector &v) {
  double sum = 0;
  for (float f : v) {
    if (!std::isfinite(f))
      throw std::runtime_error("Invalid embedding");
    sum += f * f;
  }
  if (v.size() != MODEL["dimensions"].get<size_t>() || sum < .9 || sum > 1.1)
    throw std::runtime_error("Invalid embedding contract");
}
// Application-facing contract: callers need no GGML types or model-file
// details.
class Encoder {
  clip_ctx *ctx = nullptr;

public:
  std::mutex mutex;
  explicit Encoder(const std::string &path) {
    ctx = clip_model_load(path.c_str(), 0);
    if (!ctx)
      throw std::runtime_error("Could not load the search model");
    if (clip_get_text_hparams(ctx)->projection_dim != MODEL["dimensions"] ||
        clip_get_vision_hparams(ctx)->projection_dim != MODEL["dimensions"])
      throw std::runtime_error("Model dimension mismatch");
  }
  ~Encoder() {
    if (ctx)
      clip_free(ctx);
  }
  Vector text(const std::vector<int32_t> &ids) {
    if (ids.size() < 2 || ids.size() > 77 || ids.front() != 49406 ||
        ids.back() != 49407)
      throw std::runtime_error("Invalid text tokens");
    for (auto i : ids)
      if (i < 0 || i >= 49408)
        throw std::runtime_error("Invalid token");
    clip_tokens t{const_cast<int32_t *>(ids.data()), ids.size()};
    Vector v(MODEL["dimensions"].get<size_t>());
    if (!clip_text_encode(ctx, 1, &t, v.data(), true))
      throw std::runtime_error("Text encoding failed");
    validate_vector(v);
    return v;
  }
  Vector image(const cv::Mat &bgr) {
    cv::Mat rgb;
    cv::cvtColor(bgr, rgb, cv::COLOR_BGR2RGB);
    clip_image_u8 input{rgb.cols, rgb.rows, rgb.data, rgb.total() * 3};
    clip_image_f32 resized{};
    Vector v(MODEL["dimensions"].get<size_t>());
    try {
      if (!clip_image_preprocess(ctx, &input, &resized) ||
          !clip_image_encode(ctx, 1, &resized, v.data(), true))
        throw std::runtime_error("Image encoding failed");
      clip_image_f32_clean(&resized);
      validate_vector(v);
      return v;
    } catch (...) {
      clip_image_f32_clean(&resized);
      throw;
    }
  }
};
inline float similarity(const Vector &a, const Vector &b) {
  float s = 0;
  for (size_t i = 0; i < a.size(); i++)
    s += a[i] * b[i];
  return s;
}
