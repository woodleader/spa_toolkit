"""Merge imported PGNs into the canonical catalog.

Run from the repository root or this directory. `npm run build` embeds the
validated catalog into the self-contained browser tool.
"""

from __future__ import annotations

import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
IMPORT_FILE = HERE / "pgn_import.json"
CATALOG_FILE = HERE.parent / "data" / "j1939-pgns.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def flatten_import(data):
    if not isinstance(data, list):
        raise ValueError("PGN import must be a JSON array")
    flattened = []
    for item in data:
        flattened.extend(item if isinstance(item, list) else [item])
    return flattened


def normalize(entry):
    if not isinstance(entry, dict):
        raise ValueError(f"Invalid PGN entry: {entry!r}")
    raw_pgn = entry.get("pgn", entry.get("pgn_hex"))
    if isinstance(raw_pgn, str):
        pgn = int(raw_pgn.strip(), 16 if raw_pgn.lower().startswith("0x") or "pgn_hex" in entry else 10)
    else:
        pgn = int(raw_pgn)
    if not 0 <= pgn <= 0x3FFFF:
        raise ValueError(f"PGN outside 18-bit range: {pgn}")
    name = str(entry.get("name", entry.get("label", "Unknown"))).strip()
    acronym = str(entry.get("acronym", "N/A")).strip() or "N/A"
    if not name:
        raise ValueError(f"PGN {pgn} has an empty name")
    return {"pgn": pgn, "name": name, "acronym": acronym}


def main():
    catalog = load_json(CATALOG_FILE)
    imported = [normalize(entry) for entry in flatten_import(load_json(IMPORT_FILE))]
    existing = {entry["pgn"] for entry in catalog}
    additions = [entry for entry in imported if entry["pgn"] not in existing]
    catalog.extend(additions)
    with CATALOG_FILE.open("w", encoding="utf-8") as handle:
        json.dump(catalog, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Added {len(additions)} PGNs; skipped {len(imported) - len(additions)} duplicates.")


if __name__ == "__main__":
    main()
