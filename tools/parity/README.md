# Parity Harness

Measurement harness for the rasta-a-svg converter (Claude feedback item 4).

For each test PNG: traces with the repo's WASM engine, rasterizes the vector
layers back to pixels, and scores how closely the render matches the source.

## Usage

```bash
python3 parity.py [--images a.png,b.png]
```

Prints a JSON summary to stdout. Higher "score" is better.

## Metrics

- `score`: Fraction of pixels whose worst channel differs by at most 24
  (the tolerant metric)
- `exact_pct`: Fraction of pixels exactly equal (RGBA) - the honest metric
- `mae`: Mean absolute error
- `max_err`: Maximum channel error
- `psnr`: Peak signal-to-noise ratio

## Test Images

Test images are NOT committed (see standing rule). Place PNGs in `images/`
to run the harness. The canonical 18-image suite is maintained separately.

## Files

- `parity.py`: Main harness (Python, requires PIL/numpy)
- `trace.mjs`: Node helper that invokes the WASM tracer
