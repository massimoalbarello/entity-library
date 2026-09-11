#include "search.h"
#include <iostream>

Vector at_similarity(float score) {
  Vector v(MODEL["dimensions"].get<size_t>(), 0);
  v[0] = score;
  v[1] = std::sqrt(1 - score * score);
  return v;
}
void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
int main() {
  const float cutoff = MODEL["retrieval"]["minSimilarity"];
  const auto query = at_similarity(1);
  SearchIndex index;
  require(index.search(query).empty(), "Empty index must return no matches");
  index.add(1, at_similarity(cutoff - .02f), {1, 0});
  require(index.search(query).empty(),
          "Weak-only search must return no matches");
  index.add(2, at_similarity(cutoff + .03f), {2, 0});
  index.add(3, at_similarity(cutoff + .10f), {2, 1});
  // A crop can fall below the cutoff after its 0.98 weighting.
  index.add(4, at_similarity(cutoff * 1.01f), {3, 1});
  index.add(5, at_similarity(cutoff + .05f), {4, 0});
  const auto rows = index.search(query);
  require(rows.size() == 2, "Return only qualifying photos, without padding");
  require(rows[0]["id"] == 2 && rows[0]["view_id"] == 3,
          "Deduplicate photos using their best weighted view");
  require(rows[1]["id"] == 4, "Keep qualifying results in descending order");
  for (const auto &row : rows)
    require(row["score"].get<float>() >= cutoff, "Every result meets cutoff");
  // Exactly representable boundary for this model, exercising inclusive cutoff.
  SearchIndex boundary;
  boundary.add(1, at_similarity(cutoff), {1, 0});
  require(boundary.search(query).size() == 1, "Include the cutoff boundary");
  const auto hybrid = hybrid_results(json::array({{{"id", 9}}, {{"id", 2}}}), rows);
  require(hybrid.size() == 3, "Hybrid search unions both sources without duplicates");
  require(hybrid[0]["id"] == 2 && hybrid[0]["sources"].size() == 2, "Agreement boosts matching photo");
  require(hybrid[1]["id"] == 9 && !hybrid[1].contains("view_id"), "Text-only photo remains eligible");
  require(hybrid[2]["id"] == 4 && hybrid[2]["sources"][0] == "visual", "Visual-only photo remains eligible");
  require(hybrid[0]["visual_score"] == rows[0]["score"], "Keep cosine score distinct from fused score");
  require(hybrid_results(json::array(), json::array()).empty(), "No padded hybrid results");
  std::cout
      << "PASS search threshold, weighting, aggregation and empty results\n";
}
