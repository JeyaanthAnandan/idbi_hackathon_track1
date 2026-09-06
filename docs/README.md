# MITRA — Engineering Docs

Read [VERIFICATION.md](./VERIFICATION.md) for the tested implementation as of 7 September 2026. The architecture and audit documents below contain historical findings and future plans that are not all current runtime behavior.

Planning artifacts for moving MITRA from a static browser prototype to a sandbox
environment with real data integration on AWS.

| Doc | What it answers | Audience |
|---|---|---|
| [`MITRA_Data_Field_Requirements.docx`](./MITRA_Data_Field_Requirements.docx) | **The shareable submission.** Field-level data dictionary in IDBI's template format — 237 fields across 10 APIs | IDBI |
| [`DATA_AUDIT.md`](./DATA_AUDIT.md) | How good is the mock data? What breaks when real data arrives? | Internal |
| [`API_CONTRACT.md`](./API_CONTRACT.md) | What does the backend look like — endpoints, shapes, rationale | Internal |
| [`openapi.yaml`](./openapi.yaml) | The same contract, machine-readable (53 paths, 61 schemas) | Internal / tooling |
| [`SANDBOX_REQUIREMENTS.md`](./SANDBOX_REQUIREMENTS.md) | AWS architecture, compliance, cost, phased plan | Internal |

## The IDBI submission

`MITRA_Data_Field_Requirements.docx` is the document to send. It follows the column format of
`IDBI Innovate 2026_ Data Field Requirements.pdf` (the sample IDBI supplied — kept here for
reference): Field Name / Field Type / Max Field Length / Mandatory-Optional / Sample Values /
Description, with `Engineered` marking derived fields and the same trailer fields.

Regenerate after editing the field list:

```bash
python3 docs/build_data_field_doc.py    # needs: pip install python-docx
```

Edit `build_data_field_doc.py`, not the .docx — the script is the source of truth.

## Read in this order

1. **`DATA_AUDIT.md`** — the current state, with the specific `file:line` problems.
2. **`API_CONTRACT.md`** — the target interface, and why each shape changed.
3. **`SANDBOX_REQUIREMENTS.md`** §6–7 — the phased plan and the seven open decisions.

## Run the mock API now

No AWS account needed. This unblocks the frontend refactor immediately:

```bash
npx @stoplight/prism-cli mock docs/openapi.yaml --port 4010
curl http://localhost:4010/me/snapshot
```

Prism serves paths **without** the `/v1` prefix, so point the client base URL at
`http://localhost:4010`. Add `--dynamic` for randomised payloads.

## The short version

The advice engine is genuinely computed and worth keeping almost verbatim. The data layer
around it — a synchronous module-level singleton in `src/data/customer.js` — cannot accept a
network source without a refactor, and about 20% of `src/engine/analytics.js` has one
persona's constants baked in.

Three things to do first, none of which need AWS:

1. Build a **seeded synthetic corpus** (including a zero-holdings customer — that case crashes
   the engine today).
2. **Extract the hardcoded constants** into a policy module with the shape the future
   `/policy/assumptions` endpoint returns.
3. Put **golden-file tests** around the analytics before moving anything.
