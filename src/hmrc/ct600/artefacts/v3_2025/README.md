# HMRC CT600 V3 (2025) Artefacts

Download the official CT600 artefacts from GOV.UK:
https://www.gov.uk/government/publications/corporation-tax-online-filing-hmrc-and-companies-house

## Required files

Place the following XSD files in this directory:
- `CT600.xsd` (main schema)
- Supporting XSDs referenced by main schema

## Usage

After placing files here, run:
```bash
npm run validate:ct600
```

The validation script will automatically detect XSD presence and switch to STRICT mode.

## Current Status

- **LINT mode**: Active (XSDs not yet installed)
- **STRICT mode**: Will activate when XSDs are added
