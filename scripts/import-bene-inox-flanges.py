"""Retired supplier importer. Historical references remain in data/bene-inox-flanges.json."""
def import_flanges(db, data):
    raise ValueError("Bene Inox series retired; use import-standard-stainless-flanges.py")

if __name__ == "__main__":
    import_flanges(None, None)
