#pragma once
#include <filesystem>
#include <fstream>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <stdexcept>
inline std::string read_file(const std::filesystem::path &p) {
  std::ifstream f(p, std::ios::binary);
  if (!f)
    throw std::runtime_error("File missing");
  return std::string(std::istreambuf_iterator<char>(f), {});
}
inline cv::Mat decode_image(const std::string &bytes) {
  auto u = [&](size_t i) { return (unsigned char)bytes[i]; };
  int mode = cv::IMREAD_COLOR;
  if (bytes.size() > 24 && u(0) == 137 && bytes.substr(1, 3) == "PNG") {
    auto be = [&](int p) {
      return (uint64_t(u(p)) << 24) | (uint64_t(u(p + 1)) << 16) |
             (uint64_t(u(p + 2)) << 8) | u(p + 3);
    };
    if (be(16) * be(20) > 16000000)
      throw std::runtime_error("PNG images must be at most 16 megapixels");
  } else if (bytes.size() > 4 && u(0) == 255 && u(1) == 216) {
    size_t p = 2;
    while (p + 4 < bytes.size()) {
      if (u(p++) != 255)
        break;
      auto marker = u(p++);
      if (marker == 255) {
        --p;
        continue;
      }
      if (marker == 217 || marker == 218)
        break;
      size_t n = (u(p) << 8) | u(p + 1);
      if (n < 2 || p + n > bytes.size())
        break;
      if (((marker >= 192 && marker <= 195) ||
           (marker >= 197 && marker <= 199) ||
           (marker >= 201 && marker <= 203) ||
           (marker >= 205 && marker <= 207)) &&
          n >= 8) {
        int h = (u(p + 3) << 8) | u(p + 4), w = (u(p + 5) << 8) | u(p + 6);
        int side = std::max(w, h);
        mode = side > 8192   ? cv::IMREAD_REDUCED_COLOR_8
               : side > 4096 ? cv::IMREAD_REDUCED_COLOR_4
               : side > 2048 ? cv::IMREAD_REDUCED_COLOR_2
                             : cv::IMREAD_COLOR;
        break;
      }
      p += n;
    }
  } else
    throw std::runtime_error("Use a JPEG or PNG image");
  cv::Mat raw(1, bytes.size(), CV_8U, const_cast<char *>(bytes.data()));
  auto im = cv::imdecode(raw, mode);
  if (im.empty())
    throw std::runtime_error("The image is damaged or unsupported");
  if (im.total() > 16000000)
    throw std::runtime_error("The image is too large");
  if (std::max(im.cols, im.rows) > 1536) {
    double scale = 1536. / std::max(im.cols, im.rows);
    cv::resize(im, im, {}, scale, scale, cv::INTER_AREA);
  }
  return im;
}
inline std::vector<cv::Rect> regions(const cv::Mat &im) {
  std::vector<cv::Rect> out{{0, 0, im.cols, im.rows}};
  int w = std::max(1, int(im.cols * .6)), h = std::max(1, int(im.rows * .6));
  for (int y : {0, im.rows - h})
    for (int x : {0, im.cols - w})
      out.emplace_back(x, y, w, h);
  return out;
}
