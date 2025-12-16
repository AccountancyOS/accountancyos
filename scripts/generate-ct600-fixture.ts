/**
 * Generate CT600 XML fixture from JSON computation data
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { buildCT600XML } from '../src/lib/ct600-xml-builder';

const fixture = {
  companyName: 'Test Company Ltd',
  companyNumber: 'TC123456',
  utr: '1234567890',
  periodStart: '2023-04-01',
  periodEnd: '2024-03-31',
  registeredOffice: {
    line1: '123 Test Street',
    city: 'London',
    postcode: 'EC1A 1BB'
  },
  ctComputation: {
    accounting_profit: 100000,
    total_add_backs: 5000,
    add_backs_breakdown: [
      { description: 'Depreciation', amount: 5000, category: 'depreciation' }
    ],
    total_deductions: 0,
    deductions_breakdown: [],
    total_capital_allowances: 3000,
    balancing_charges: 0,
    net_capital_allowances: 3000,
    pools_summary: [],
    claims_summary: [],
    taxable_total_profits: 102000,
    applicable_rate: 'marginal',
    effective_rate: 0.2175,
    adjusted_lower_limit: 50000,
    adjusted_upper_limit: 250000,
    tax_at_main_rate: 25500,
    marginal_relief_fraction: 0.015,
    marginal_relief_amount: 2220,
    corporation_tax_due: 23280,
    short_period_factor: 1,
    associated_companies_count: 0
  }
};

async function main() {
  console.log('Generating CT600 XML fixture...\n');
  
  // Ensure tmp directory exists
  if (!existsSync('tmp')) {
    mkdirSync('tmp', { recursive: true });
  }
  
  try {
    const result = buildCT600XML(fixture);
    
    // Write the CT600 content XML
    const outputPath = 'tmp/ct600.xml';
    writeFileSync(outputPath, result.xml);
    
    console.log(`✓ Generated: ${outputPath}`);
    console.log(`  Transaction ID: ${result.transactionId}`);
    console.log(`  Version: ${result.version}`);
    console.log(`  Size: ${result.xml.length} bytes\n`);
    
    console.log('To validate, run:');
    console.log('  npm run validate:ct600');
    
  } catch (error) {
    console.error('✗ Generation failed:', error);
    process.exit(1);
  }
}

main();
