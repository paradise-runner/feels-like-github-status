# Feels-like GitHub Status

GitHub uptime, filtered to the hours you actually use it.

This is a remix of [mrshu/github-statuses](https://github.com/mrshu/github-statuses) (MIT) — instead of computing one platform-wide uptime number across every minute of the last 90 days, you paint a weekly schedule of *your* hours, and the page shows how reliable GitHub felt during them.

## Develop locally

```bash
# Serve the static site
python3 -m http.server 8000
# open http://localhost:8000/site/
```

## Run the unit tests

```bash
node --test site/lib/*.test.js
```

## Refresh the data (optional)

The `parsed/` directory is committed and updated daily by CI. To regenerate locally:

```bash
uv sync
uv run python pipeline/extract_incidents.py --out parsed --enrich-impact --infer-components gliner2
```

(Requires Python 3.11–3.13. The GLiNER2 step downloads PyTorch and is heavy; omit `--infer-components gliner2` if you don't need ML-inferred components.)

## Layout

- `site/` — static site (HTML, CSS, vanilla ES modules)
- `pipeline/` — vendored Python data pipeline (MIT, see `pipeline/LICENSE`)
- `parsed/` — generated incident data committed by CI

## License

MIT for original code in this repo. Vendored pipeline retains its upstream MIT license — see `pipeline/LICENSE`.
