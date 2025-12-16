/**
 * CT600 XSD Validation Harness
 * Dual-mode: STRICT (with XSD) or LINT (without XSD)
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';

const XSD_PATH = 'src/hmrc/ct600/artefacts/v3_2025/CT600.xsd';
const DEFAULT_XML_PATH = 'tmp/ct600.xml';

interface ValidationResult {
  valid: boolean;
  mode: 'STRICT' | 'LINT';
  errors: string[];
  warnings: string[];
}

function runLintValidation(xml: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Well-formed XML check
  if (!xml.startsWith('<?xml')) {
    warnings.push('Missing XML declaration');
  }

  // 2. Try to parse as XML
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      errors.push(`XML parse error: ${parseErrors[0].textContent}`);
    }
  } catch (e) {
    errors.push(`XML parse exception: ${e}`);
  }

  // 3. Required GovTalk nodes (for full envelope) or CT600 nodes (for content)
  const requiredEnvelopeNodes = ['GovTalkMessage', 'Header', 'Body', 'IRenvelope'];
  const requiredCT600Nodes = ['TaxableProfit', 'CorporationTaxDue', 'TotalCorporationTax'];
  
  let hasEnvelope = false;
  for (const node of requiredEnvelopeNodes) {
    if (xml.includes(`<${node}`) || xml.includes(`<${node}>`)) {
      hasEnvelope = true;
      break;
    }
  }

  if (hasEnvelope) {
    for (const node of requiredEnvelopeNodes) {
      if (!xml.includes(`<${node}`) && !xml.includes(`<${node}>`)) {
        warnings.push(`Missing envelope node: ${node}`);
      }
    }
  } else {
    // Check for CT600 content nodes
    for (const node of requiredCT600Nodes) {
      if (!xml.includes(`<${node}>`)) {
        warnings.push(`Missing CT600 node: ${node}`);
      }
    }
  }

  // 4. No illegal XML characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(xml)) {
    errors.push('Contains illegal XML characters');
  }

  // 5. Ampersand properly escaped
  const unescapedAmp = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g;
  const matches = xml.match(unescapedAmp);
  if (matches && matches.length > 0) {
    errors.push(`Contains ${matches.length} unescaped ampersand(s)`);
  }

  // 6. Schema location hints
  if (!xml.includes('xmlns=') && !xml.includes('xmlns:')) {
    warnings.push('No xmlns namespace declarations found');
  }

  return {
    valid: errors.length === 0,
    mode: 'LINT',
    errors,
    warnings
  };
}

async function runStrictValidation(xml: string, xsdPath: string): Promise<ValidationResult> {
  // Placeholder for XSD validation - requires libxmljs2 or similar
  // For now, fall back to lint + XSD presence check
  console.log('  XSD file found - would run schema validation');
  console.log('  (Full XSD validation requires libxmljs2 native module)');
  
  const lintResult = runLintValidation(xml);
  return {
    ...lintResult,
    mode: 'STRICT',
    warnings: [...lintResult.warnings, 'XSD schema validation not fully implemented yet']
  };
}

async function main() {
  const xmlPath = process.argv[2] || DEFAULT_XML_PATH;
  
  console.log('CT600 XSD Validation Harness');
  console.log('============================\n');
  
  // Check if XML file exists
  if (!existsSync(xmlPath)) {
    console.error(`✗ XML file not found: ${xmlPath}`);
    console.log('\nTo generate a test fixture, run:');
    console.log('  npm run generate:ct600-fixture');
    process.exit(1);
  }
  
  const xmlContent = readFileSync(xmlPath, 'utf8');
  console.log(`Input file: ${xmlPath} (${xmlContent.length} bytes)\n`);
  
  let result: ValidationResult;
  
  if (existsSync(XSD_PATH)) {
    console.log('✓ XSD found. Running STRICT validation...\n');
    result = await runStrictValidation(xmlContent, XSD_PATH);
  } else {
    console.log('⚠ XSD not found. Running LINT validation...');
    console.log('  (STRICT XSD VALIDATION SKIPPED: artefacts missing)\n');
    result = runLintValidation(xmlContent);
  }
  
  // Output results
  console.log(`Mode: ${result.mode}`);
  console.log(`Valid: ${result.valid ? '✓ YES' : '✗ NO'}\n`);
  
  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(e => console.log(`  ✗ ${e}`));
    console.log('');
  }
  
  if (result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
    console.log('');
  }
  
  if (result.valid && result.errors.length === 0) {
    console.log('✓ Validation passed');
  }
  
  process.exit(result.valid ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
