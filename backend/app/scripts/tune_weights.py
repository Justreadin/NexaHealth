# scripts/tune_weights_from_json.py
import itertools
import argparse
import json
import time
from pathlib import Path
from app.routers.verify import build_indexes, score_drug_against_input, normalize_text_ultra, WEIGHTS

# CLI args
parser = argparse.ArgumentParser()
parser.add_argument("--json_path", required=True, help="Path to JSON drug DB")
parser.add_argument("--limit_tests", type=int, default=200, help="Limit number of eval rows to run")
args = parser.parse_args()

def load_eval_rows_from_json(json_path, limit=None):
    print(f"[INFO] Loading JSON data from {json_path}...")
    rows = []
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    print(f"[INFO] Total records in JSON: {len(data)}")
    for i, drug in enumerate(data):
        rows.append({
            "input_product": drug.get("product_name", ""),
            "input_generic": drug.get("generic_name", ""),
            "input_manufacturer": drug.get("manufacturer", {}).get("name", ""),
            "input_nafdac": drug.get("identifiers", {}).get("nafdac_reg_no", ""),
            "expected_nexahealth_id": str(drug.get("nexahealth_id", ""))
        })
        if limit and i + 1 >= limit:
            break
    print(f"[INFO] Loaded {len(rows)} evaluation rows from JSON")
    return rows

def evaluate_setting(rows, idx):
    correct = 0
    total = len(rows)
    start_eval = time.time()
    for i, row in enumerate(rows, 1):
        inputs = {
            "product_name": normalize_text_ultra(row.get("input_product", "") or ""),
            "raw_product_name": row.get("input_product", "") or "",
            "generic_name": normalize_text_ultra(row.get("input_generic", "") or ""),
            "raw_generic_name": row.get("input_generic", "") or "",
            "manufacturer": normalize_text_ultra(row.get("input_manufacturer", "") or ""),
            "raw_manufacturer": row.get("input_manufacturer", "") or "",
            "nafdac": (row.get("input_nafdac", "") or "").replace(" ", "").replace("-", ""),
            "raw_nafdac": row.get("input_nafdac", "") or ""
        }
        best_nid = None
        best_score = -1
        for nid, drug in idx["id_map"].items():
            score, _ = score_drug_against_input(drug, inputs)
            if score > best_score:
                best_score = score
                best_nid = nid
        expected = str(row.get("expected_nexahealth_id", "")).strip()
        if str(best_nid) == expected:
            correct += 1

        if i % max(1, total // 10) == 0 or i == total:
            pct = (i / total) * 100
            print(f"[DEBUG] Eval progress: {i}/{total} ({pct:.1f}%) done")

    accuracy = correct / total if total else 0
    elapsed = time.time() - start_eval
    print(f"[DEBUG] Evaluation done: {correct}/{total} correct => accuracy={accuracy:.3f} (time: {elapsed:.1f}s)")
    return accuracy

def main():
    print("[INFO] Building indexes for evaluation...")
    idx = build_indexes()
    rows = load_eval_rows_from_json(args.json_path, limit=args.limit_tests)

    product_range = [0.3, 0.35, 0.4, 0.45]
    generic_range = [0.3, 0.35, 0.4, 0.45]
    manu_range = [0.1, 0.15, 0.2]
    nafdac_add_range = [0.2, 0.25, 0.3, 0.35]

    best = []
    total_iters = len(product_range) * len(generic_range) * len(manu_range) * len(nafdac_add_range)
    print("[INFO] Starting weight grid search tuning...")
    start_total = time.time()

    for i, (p, g, m, nadd) in enumerate(itertools.product(product_range, generic_range, manu_range, nafdac_add_range), 1):
        if p + g + m > 1.2:
            print(f"[SKIP] Skipping weights p={p} g={g} m={m} nadd={nadd} because sum exceeds 1.2")
            continue
        WEIGHTS["product_name"] = p
        WEIGHTS["generic_name"] = g
        WEIGHTS["manufacturer"] = m
        WEIGHTS["nafdac_additive"] = nadd

        iter_start = time.time()
        acc = evaluate_setting(rows, idx)
        iter_elapsed = time.time() - iter_start

        print(f"[RESULT] ({i}/{total_iters}) p={p} g={g} m={m} nadd={nadd} => accuracy={acc:.3f} (eval time: {iter_elapsed:.1f}s)")
        best.append((acc, dict(WEIGHTS)))

        pct_done = (i / total_iters) * 100
        print(f"[INFO] Progress: {pct_done:.1f}% completed")

    total_elapsed = time.time() - start_total
    print(f"\n[INFO] Grid search done in {total_elapsed:.1f}s")
    best.sort(reverse=True, key=lambda x: x[0])
    print("\n[INFO] Top 5 weight settings:")
    for acc, w in best[:5]:
        print(f"Accuracy: {acc:.3f} Weights: {w}")

if __name__ == "__main__":
    main()
