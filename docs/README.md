# MITRA — Engineering Docs

| Doc | What it answers | Audience |
|---|---|---|
| [`MITRA_Data_Field_Requirements.docx`](./MITRA_Data_Field_Requirements.docx) | **The shareable submission.** Field-level data dictionary in IDBI's template format — 237 fields across 10 APIs | IDBI |
| [`API_CONTRACT.md`](./API_CONTRACT.md) | Backend endpoints, shapes, and rationale | Internal |
| [`openapi.yaml`](./openapi.yaml) | The same contract, machine-readable (53 paths, 61 schemas) | Internal / tooling |
| [`IDBI_API_REVIEW.md`](./IDBI_API_REVIEW.md) | Which sandbox APIs the connector uses | Internal |
| [`IDBI_RESPONSE_SCHEMAS.md`](./IDBI_RESPONSE_SCHEMAS.md) | Observed sandbox response shapes | Internal |

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

1. **`MITRA_Data_Field_Requirements.docx`** — the field list for IDBI.
2. **`API_CONTRACT.md`** — the target interface.
3. **`openapi.yaml`** — the same contract, machine-readable.
