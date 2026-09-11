import { Tokenizer } from "@huggingface/tokenizers";
import { join } from "node:path";
import manifest from "./manifest.json";
export const labels = [
  "banana",
  "apple",
  "orange",
  "lemon",
  "strawberry",
  "grapes",
  "pineapple",
  "broccoli",
  "carrot",
  "bread",
  "pizza",
  "cake",
  "coffee",
  "bottle",
  "cup",
  "bowl",
  "plate",
  "fork",
  "spoon",
  "knife",
  "cat",
  "dog",
  "bear",
  "bird",
  "horse",
  "flower",
  "tree",
  "plant",
  "car",
  "bicycle",
  "motorcycle",
  "bus",
  "boat",
  "airplane",
  "train",
  "book",
  "laptop",
  "keyboard",
  "computer mouse",
  "remote control",
  "phone",
  "television",
  "camera",
  "backpack",
  "handbag",
  "suitcase",
  "shoe",
  "hat",
  "watch",
  "umbrella",
  "chair",
  "sofa",
  "bed",
  "table",
  "lamp",
  "clock",
  "scissors",
  "teddy bear",
  "beach",
  "mountain",
  "snow",
  "building",
];
export async function loadTextEncoder(directory: string) {
  const tokenizer = new Tokenizer(
    await Bun.file(join(directory, "tokenizer.json")).json(),
    await Bun.file(join(directory, "tokenizer_config.json")).json(),
  );
  function encode(query: string) {
    const normalized = query.trim().replace(/\s+/g, " ");
    if (!normalized || normalized.length > 240)
      throw Error("Use a search between 1 and 240 characters");
    const ids = tokenizer.encode(`a photo of ${normalized}`).ids;
    const bounded = ids.slice(0, manifest.contextLength);
    if (ids.length > manifest.contextLength)
      bounded[bounded.length - 1] = 49407;
    if (
      bounded[0] !== 49406 ||
      bounded.at(-1) !== 49407 ||
      bounded.some((n) => !Number.isInteger(n) || n < 0 || n >= 49408)
    )
      throw Error("Invalid tokenizer output");
    return bounded;
  }
  return {
    encode,
    labelTokens: labels.map((label) => ({ label, tokens: encode(label) })),
  };
}
