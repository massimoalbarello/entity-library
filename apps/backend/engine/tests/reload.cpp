#include "model.h"
#include <opencv2/imgcodecs.hpp>
#include <iostream>
int main(int argc, char **argv) {
  if (argc != 3) return 2;
  auto image = cv::imread(argv[2]);
  if (image.empty()) return 3;
  Vector first;
  for (int n=0; n<4; ++n) {
    Encoder encoder(argv[1]);
    auto v = encoder.image(image);
    if (first.empty()) first=v;
    for (size_t i=0; i<v.size(); ++i)
      if (std::abs(first[i]-v[i]) > 1e-5) throw std::runtime_error("Reload changed image embedding");
    cv::Mat solid(1536,1536,CV_8UC3,cv::Scalar(255,0,0));
    encoder.image(solid); // an unrelated allocation/inference must not contaminate the next result
    auto repeated=encoder.image(image);
    for (size_t i=0; i<v.size(); ++i)
      if (std::abs(first[i]-repeated[i]) > 1e-5) throw std::runtime_error("Repeated image embedding changed");
  }
  std::cout << "Model unload/reload and repeated image embeddings are stable\n";
}
