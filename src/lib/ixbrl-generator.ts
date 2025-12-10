// iXBRL Generator Interface and Stub Implementation
// This module provides an abstraction layer for iXBRL generation, allowing future integration
// with third-party providers (e.g., Coretax, Mercia) without changing calling code.

import { AccountsModel, AccountsStandard } from './accounts-model-mapper';

export interface IXBRLGenerationResult {
  success: boolean;
  ixbrl?: string;
  errors: string[];
  warnings: string[];
  metadata?: {
    generatedAt: string;
    standard: AccountsStandard;
    taxonomyVersion: string;
    documentType: string;
  };
}

export interface IXBRLGeneratorConfig {
  provider: 'stub' | 'coretax' | 'mercia' | 'custom';
  apiKey?: string;
  apiEndpoint?: string;
  sandbox?: boolean;
}

/**
 * Interface for iXBRL generators
 * Implementations must provide a method to generate iXBRL from an AccountsModel
 */
export interface IXBRLGenerator {
  /**
   * Generates iXBRL document from an AccountsModel
   */
  generateAccountsIXBRL(model: AccountsModel): Promise<IXBRLGenerationResult>;
  
  /**
   * Validates that a model can be converted to iXBRL
   */
  validateForIXBRL(model: AccountsModel): { valid: boolean; errors: string[] };
  
  /**
   * Returns the taxonomy version used by this generator
   */
  getTaxonomyVersion(): string;
}

/**
 * Stub iXBRL Generator for development and CH sandbox testing
 * Generates minimal valid iXBRL that passes CH validation
 */
export class StubIXBRLGenerator implements IXBRLGenerator {
  private readonly taxonomyVersion = '2023-01-01';
  
  async generateAccountsIXBRL(model: AccountsModel): Promise<IXBRLGenerationResult> {
    const validation = this.validateForIXBRL(model);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
        warnings: [],
      };
    }

    try {
      const ixbrl = this.buildIXBRLDocument(model);
      
      return {
        success: true,
        ixbrl,
        errors: [],
        warnings: ['This is a stub implementation for sandbox testing only'],
        metadata: {
          generatedAt: new Date().toISOString(),
          standard: model.standard,
          taxonomyVersion: this.taxonomyVersion,
          documentType: model.standard === 'FRS105' ? 'micro-entity-accounts' : 'small-company-accounts',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        errors: [`iXBRL generation failed: ${error.message}`],
        warnings: [],
      };
    }
  }

  validateForIXBRL(model: AccountsModel): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields for CH submission
    if (!model.company.number) errors.push('Company number is required');
    if (!model.company.name) errors.push('Company name is required');
    if (!model.period.start) errors.push('Period start date is required');
    if (!model.period.end) errors.push('Period end date is required');
    
    // Balance sheet must balance
    if (Math.abs(model.balanceSheet.netAssets - model.balanceSheet.totalEquity) > 0.01) {
      errors.push('Balance sheet does not balance');
    }

    // Approval required
    if (!model.approval.approvedByBoard) {
      errors.push('Accounts must be approved by the board');
    }

    return { valid: errors.length === 0, errors };
  }

  getTaxonomyVersion(): string {
    return this.taxonomyVersion;
  }

  private buildIXBRLDocument(model: AccountsModel): string {
    const periodEnd = model.period.end;
    const periodStart = model.period.start;
    const companyNumber = model.company.number.padStart(8, '0');
    
    // Generate unique identifiers
    const documentId = `${companyNumber}-${periodEnd.replace(/-/g, '')}`;
    
    // Build the iXBRL document
    // This is a simplified structure that passes CH validation
    const ixbrl = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"
      xmlns:link="http://www.xbrl.org/2003/linkbase"
      xmlns:xlink="http://www.w3.org/1999/xlink"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
      xmlns:uk-core="http://xbrl.frc.org.uk/fr/2023-01-01/core"
      xmlns:uk-bus="http://xbrl.frc.org.uk/cd/2023-01-01/business"
      xmlns:uk-geo="http://xbrl.frc.org.uk/cd/2023-01-01/countries"
      xmlns:uk-direp="http://xbrl.frc.org.uk/reports/2023-01-01/direp"
      xmlns:uk-gaap="http://xbrl.frc.org.uk/fr/2023-01-01/frs-${model.standard === 'FRS105' ? '105' : '102'}"
      xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Annual Accounts - ${this.escapeHtml(model.company.name)}</title>
  <ix:header>
    <ix:hidden>
      <ix:nonNumeric name="uk-bus:EntityCurrentLegalOrRegisteredName" contextRef="FY1">${this.escapeHtml(model.company.name)}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:UKCompaniesHouseRegisteredNumber" contextRef="FY1">${companyNumber}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:StartDateForPeriodCoveredByReport" contextRef="FY1">${periodStart}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:EndDateForPeriodCoveredByReport" contextRef="FY1">${periodEnd}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:BalanceSheetDate" contextRef="FY1">${periodEnd}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:AccountsStatusAuditedOrUnaudited" contextRef="FY1">Unaudited</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:AccountingStandardsApplied" contextRef="FY1">${model.standard === 'FRS105' ? 'Micro-entities Regime' : 'Small Entities Regime'}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:LegalFormOfEntity" contextRef="FY1">PrivateLimitedCompanyByShares</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:CountryOfIncorporation" contextRef="FY1">uk-geo:EnglandWales</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:AddressLine1" contextRef="FY1">${this.escapeHtml(model.company.registeredOffice.line1)}</ix:nonNumeric>
      ${model.company.registeredOffice.line2 ? `<ix:nonNumeric name="uk-bus:AddressLine2" contextRef="FY1">${this.escapeHtml(model.company.registeredOffice.line2)}</ix:nonNumeric>` : ''}
      <ix:nonNumeric name="uk-bus:PrincipalLocation-CityOrTown" contextRef="FY1">${this.escapeHtml(model.company.registeredOffice.city)}</ix:nonNumeric>
      <ix:nonNumeric name="uk-bus:PostalCodeZip" contextRef="FY1">${this.escapeHtml(model.company.registeredOffice.postcode)}</ix:nonNumeric>
    </ix:hidden>
    <ix:references>
      <link:schemaRef xlink:type="simple" xlink:href="https://xbrl.frc.org.uk/fr/2023-01-01/frs-${model.standard === 'FRS105' ? '105' : '102'}.xsd"/>
    </ix:references>
    <ix:resources>
      <xbrli:context id="FY1">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${companyNumber}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:startDate>${periodStart}</xbrli:startDate>
          <xbrli:endDate>${periodEnd}</xbrli:endDate>
        </xbrli:period>
      </xbrli:context>
      <xbrli:context id="FY1-end">
        <xbrli:entity>
          <xbrli:identifier scheme="http://www.companieshouse.gov.uk/">${companyNumber}</xbrli:identifier>
        </xbrli:entity>
        <xbrli:period>
          <xbrli:instant>${periodEnd}</xbrli:instant>
        </xbrli:period>
      </xbrli:context>
      <xbrli:unit id="GBP">
        <xbrli:measure>iso4217:GBP</xbrli:measure>
      </xbrli:unit>
      <xbrli:unit id="pure">
        <xbrli:measure>xbrli:pure</xbrli:measure>
      </xbrli:unit>
    </ix:resources>
  </ix:header>
</head>
<body>
  <div class="accounts-document">
    <h1>${this.escapeHtml(model.company.name)}</h1>
    <h2>Annual Accounts</h2>
    <p>For the period ${periodStart} to ${periodEnd}</p>
    <p>Company Registration Number: ${companyNumber}</p>
    
    <section class="balance-sheet">
      <h3>Balance Sheet as at ${periodEnd}</h3>
      
      <table>
        <tbody>
          <tr>
            <td>Fixed Assets</td>
            <td><ix:nonFraction name="uk-gaap:FixedAssets" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.totalFixedAssets}</ix:nonFraction></td>
          </tr>
          <tr>
            <td>Current Assets</td>
            <td><ix:nonFraction name="uk-gaap:CurrentAssets" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.totalCurrentAssets}</ix:nonFraction></td>
          </tr>
          <tr>
            <td>Creditors: amounts falling due within one year</td>
            <td><ix:nonFraction name="uk-gaap:CreditorsDueWithinOneYear" contextRef="FY1-end" unitRef="GBP" decimals="0" sign="-">${model.balanceSheet.creditorsWithinOneYear || 0}</ix:nonFraction></td>
          </tr>
          <tr>
            <td><strong>Net Current Assets</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:NetCurrentAssetsLiabilities" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.netCurrentAssets}</ix:nonFraction></strong></td>
          </tr>
          <tr>
            <td>Total assets less current liabilities</td>
            <td><ix:nonFraction name="uk-gaap:TotalAssetsLessCurrentLiabilities" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.totalAssetsLessCurrentLiabilities}</ix:nonFraction></td>
          </tr>
          ${model.balanceSheet.creditorsAfterOneYear ? `
          <tr>
            <td>Creditors: amounts falling due after more than one year</td>
            <td><ix:nonFraction name="uk-gaap:CreditorsDueAfterOneYear" contextRef="FY1-end" unitRef="GBP" decimals="0" sign="-">${model.balanceSheet.creditorsAfterOneYear}</ix:nonFraction></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Net Assets</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:NetAssetsLiabilities" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.netAssets}</ix:nonFraction></strong></td>
          </tr>
        </tbody>
      </table>
      
      <h4>Capital and Reserves</h4>
      <table>
        <tbody>
          <tr>
            <td>Called up share capital</td>
            <td><ix:nonFraction name="uk-gaap:CalledUpShareCapital" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.calledUpShareCapital}</ix:nonFraction></td>
          </tr>
          ${model.balanceSheet.sharePremiuim ? `
          <tr>
            <td>Share premium account</td>
            <td><ix:nonFraction name="uk-gaap:SharePremiumAccount" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.sharePremiuim}</ix:nonFraction></td>
          </tr>
          ` : ''}
          <tr>
            <td>Profit and loss account</td>
            <td><ix:nonFraction name="uk-gaap:ProfitLossAccountReserve" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.profitAndLossReserve}</ix:nonFraction></td>
          </tr>
          <tr>
            <td><strong>Total Equity</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:Equity" contextRef="FY1-end" unitRef="GBP" decimals="0">${model.balanceSheet.totalEquity}</ix:nonFraction></strong></td>
          </tr>
        </tbody>
      </table>
    </section>
    
    ${model.profitAndLoss ? this.buildProfitAndLossSection(model) : ''}
    
    <section class="notes">
      <h3>Notes to the Accounts</h3>
      
      <h4>1. Accounting Policies</h4>
      <p><ix:nonNumeric name="uk-direp:StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime" contextRef="FY1">${this.escapeHtml(model.notes.accountingPolicies.basisOfPreparation)}</ix:nonNumeric></p>
      
      ${model.notes.averageEmployees !== undefined ? `
      <h4>2. Employees</h4>
      <p>Average number of employees during the period: <ix:nonFraction name="uk-bus:AverageNumberEmployeesDuringPeriod" contextRef="FY1" unitRef="pure" decimals="0">${model.notes.averageEmployees}</ix:nonFraction></p>
      ` : ''}
      
      ${model.notes.directorsAdvances?.exists ? `
      <h4>Directors' Advances and Credits</h4>
      <p>Loans and advances to directors: £${model.notes.directorsAdvances.amount || 0}</p>
      ` : ''}
    </section>
    
    <section class="approval">
      <p>The accounts were approved by the board and authorised for issue on ${model.approval.approvalDate || periodEnd}</p>
      <p>Signed on behalf of the board:</p>
      <p>${this.escapeHtml(model.approval.signatory || 'Director')}</p>
      <p>${this.escapeHtml(model.approval.signatoryRole || 'Director')}</p>
    </section>
  </div>
</body>
</html>`;

    return ixbrl;
  }

  private buildProfitAndLossSection(model: AccountsModel): string {
    const pl = model.profitAndLoss!;
    return `
    <section class="profit-and-loss">
      <h3>Profit and Loss Account for the period ${model.period.start} to ${model.period.end}</h3>
      <table>
        <tbody>
          <tr>
            <td>Turnover</td>
            <td><ix:nonFraction name="uk-gaap:TurnoverRevenue" contextRef="FY1" unitRef="GBP" decimals="0">${pl.turnover}</ix:nonFraction></td>
          </tr>
          ${pl.costOfSales ? `
          <tr>
            <td>Cost of sales</td>
            <td><ix:nonFraction name="uk-gaap:CostSales" contextRef="FY1" unitRef="GBP" decimals="0" sign="-">${pl.costOfSales}</ix:nonFraction></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Gross Profit</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:GrossProfitLoss" contextRef="FY1" unitRef="GBP" decimals="0">${pl.grossProfit}</ix:nonFraction></strong></td>
          </tr>
          ${pl.administrativeExpenses ? `
          <tr>
            <td>Administrative expenses</td>
            <td><ix:nonFraction name="uk-gaap:AdministrativeExpenses" contextRef="FY1" unitRef="GBP" decimals="0" sign="-">${pl.administrativeExpenses}</ix:nonFraction></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Operating Profit</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:OperatingProfitLoss" contextRef="FY1" unitRef="GBP" decimals="0">${pl.operatingProfit}</ix:nonFraction></strong></td>
          </tr>
          <tr>
            <td><strong>Profit Before Tax</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:ProfitLossBeforeTax" contextRef="FY1" unitRef="GBP" decimals="0">${pl.profitBeforeTax}</ix:nonFraction></strong></td>
          </tr>
          ${pl.taxation ? `
          <tr>
            <td>Taxation</td>
            <td><ix:nonFraction name="uk-gaap:TaxTaxCreditOnProfitOrLossOnOrdinaryActivities" contextRef="FY1" unitRef="GBP" decimals="0" sign="-">${pl.taxation}</ix:nonFraction></td>
          </tr>
          ` : ''}
          <tr>
            <td><strong>Profit for the Financial Year</strong></td>
            <td><strong><ix:nonFraction name="uk-gaap:ProfitLoss" contextRef="FY1" unitRef="GBP" decimals="0">${pl.profitAfterTax}</ix:nonFraction></strong></td>
          </tr>
        </tbody>
      </table>
    </section>`;
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

/**
 * Factory function to create an iXBRL generator based on config
 */
export function createIXBRLGenerator(config: IXBRLGeneratorConfig): IXBRLGenerator {
  switch (config.provider) {
    case 'stub':
      return new StubIXBRLGenerator();
    case 'coretax':
    case 'mercia':
    case 'custom':
      // Placeholder for future third-party integrations
      console.warn(`Provider ${config.provider} not yet implemented, using stub`);
      return new StubIXBRLGenerator();
    default:
      return new StubIXBRLGenerator();
  }
}

/**
 * Default generator instance for convenience
 */
export const defaultIXBRLGenerator = new StubIXBRLGenerator();
