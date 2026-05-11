# Vendored pipeline

This directory contains the data extraction pipeline from [mrshu/github-statuses](https://github.com/mrshu/github-statuses), used under its MIT license (see `LICENSE`).

- **Upstream commit:** `01cf69735cb8fa8c89c0135ef9acb9523976cf12`
- **Vendored on:** 2026-05-08
- **Reason for vendoring:** independence from upstream availability and freedom to evolve our schema.

To re-vendor at a newer commit:

1. Clone upstream and checkout the new SHA.
2. Copy the same files listed below.
3. Update this `UPSTREAM.md` with the new SHA and date.
4. Run `node --test site/lib/data.test.js` to confirm our parser still handles the data shape.

Files vendored:
- `extract_incidents.py` (from `scripts/`)
- `run_gliner_experiment.py` (from `scripts/`)
- `github-status-history.atom`
- `tests/test_extract_incidents.py`
- `LICENSE`
