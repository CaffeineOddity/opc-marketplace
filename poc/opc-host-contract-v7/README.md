# V7 PoC — kit-mtime heuristic

See [RESULTS.md](RESULTS.md) for the contract under test, harness design, and
the measured FP/FN rates.

```bash
node harness.mjs        # run all 7 scenarios, exit 0 if all 3 criteria pass
KEEP=1 node harness.mjs # keep the sandbox at $TMPDIR for inspection
```
