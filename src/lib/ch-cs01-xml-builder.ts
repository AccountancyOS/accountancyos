/**
 * Companies House CS01 XML Builder
 * Builds XML payloads for CS01 Confirmation Statement submissions
 * 
 * Reference: Companies House XML Gateway Schema
 */

export interface CS01XMLInput {
  // Company details
  companyNumber: string;
  companyName: string;
  
  // Statement details
  madeUpToDate: string; // YYYY-MM-DD
  
  // Presenter details (from organization settings)
  presenter: {
    id: string;
    name: string;
    email: string;
  };
  
  // Company authentication
  authCode: string;
  
  // Confirmation details
  confirmations: {
    tradingStatusUnchanged: boolean;
    sicCodesConfirmed: boolean;
    shareholderInformationConfirmed: boolean;
    statementOfCapitalConfirmed: boolean;
    pscInformationConfirmed: boolean;
    officerInformationConfirmed: boolean;
    registeredOfficeConfirmed: boolean;
  };
  
  // SIC codes (if changed)
  sicCodes?: string[];
  
  // Share capital (if changed)
  shareCapital?: {
    totalShares: number;
    totalAggregateNominalValue: number;
    currency: string;
    classes?: Array<{
      className: string;
      prescribedParticulars: string;
      numberOfShares: number;
      nominalValue: number;
      amountPaidUp: number;
      amountUnpaid: number;
    }>;
  };
  
  // Registered office (if changed)
  registeredOffice?: {
    addressLine1: string;
    addressLine2?: string;
    locality: string;
    region?: string;
    postalCode: string;
    country: string;
  };
}

export interface CS01XMLResult {
  xml: string;
  transactionId: string;
}

/**
 * Build CS01 XML payload for Companies House submission
 */
export function buildCS01XML(input: CS01XMLInput): CS01XMLResult {
  // Generate unique transaction ID
  const transactionId = `CS01-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  
  const timestamp = new Date().toISOString();
  
  // Build the XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompaniesHouse</Class>
      <Qualifier>request</Qualifier>
      <Function>ConfirmationStatement</Function>
      <TransactionID>${escapeXml(transactionId)}</TransactionID>
      <CorrelationID/>
      <ResponseEndPoint PollInterval="10"/>
      <Transformation>XML</Transformation>
      <GatewayTest>0</GatewayTest>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXml(input.presenter.id)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Role>principal</Role>
          <Value/>
        </Authentication>
      </IDAuthentication>
      <EmailAddress>${escapeXml(input.presenter.email)}</EmailAddress>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys>
      <Key Type="CompanyNumber">${escapeXml(input.companyNumber)}</Key>
      <Key Type="CompanyAuthCode">${escapeXml(input.authCode)}</Key>
    </Keys>
  </GovTalkDetails>
  <Body>
    <ConfirmationStatement xmlns="http://xmlgw.companieshouse.gov.uk/v1-0/schema">
      <CompanyNumber>${escapeXml(input.companyNumber)}</CompanyNumber>
      <CompanyName>${escapeXml(input.companyName)}</CompanyName>
      <MadeUpDate>${formatDateForXML(input.madeUpToDate)}</MadeUpDate>
      <ConfirmationStatementDate>${formatDateForXML(new Date().toISOString().split('T')[0])}</ConfirmationStatementDate>
      
      <Confirmations>
        <TradingStatusUnchanged>${input.confirmations.tradingStatusUnchanged ? 'true' : 'false'}</TradingStatusUnchanged>
        <SicCodesConfirmed>${input.confirmations.sicCodesConfirmed ? 'true' : 'false'}</SicCodesConfirmed>
        <ShareholderInformationConfirmed>${input.confirmations.shareholderInformationConfirmed ? 'true' : 'false'}</ShareholderInformationConfirmed>
        <StatementOfCapitalConfirmed>${input.confirmations.statementOfCapitalConfirmed ? 'true' : 'false'}</StatementOfCapitalConfirmed>
        <PSCInformationConfirmed>${input.confirmations.pscInformationConfirmed ? 'true' : 'false'}</PSCInformationConfirmed>
        <OfficerInformationConfirmed>${input.confirmations.officerInformationConfirmed ? 'true' : 'false'}</OfficerInformationConfirmed>
        <RegisteredOfficeConfirmed>${input.confirmations.registeredOfficeConfirmed ? 'true' : 'false'}</RegisteredOfficeConfirmed>
      </Confirmations>
      
${buildSicCodesSection(input.sicCodes)}
${buildShareCapitalSection(input.shareCapital)}
${buildRegisteredOfficeSection(input.registeredOffice)}
      
      <PresenterDetails>
        <PresenterID>${escapeXml(input.presenter.id)}</PresenterID>
        <PresenterName>${escapeXml(input.presenter.name)}</PresenterName>
        <PresenterEmail>${escapeXml(input.presenter.email)}</PresenterEmail>
      </PresenterDetails>
      
      <Timestamp>${timestamp}</Timestamp>
    </ConfirmationStatement>
  </Body>
</GovTalkMessage>`;

  return { xml, transactionId };
}

/**
 * Build SIC codes section if provided
 */
function buildSicCodesSection(sicCodes?: string[]): string {
  if (!sicCodes || sicCodes.length === 0) {
    return '';
  }
  
  const codesXml = sicCodes.map(code => `        <SicCode>${escapeXml(code)}</SicCode>`).join('\n');
  return `      <SicCodes>
${codesXml}
      </SicCodes>`;
}

/**
 * Build statement of capital section if provided
 */
function buildShareCapitalSection(shareCapital?: CS01XMLInput['shareCapital']): string {
  if (!shareCapital) {
    return '';
  }
  
  let classesXml = '';
  if (shareCapital.classes && shareCapital.classes.length > 0) {
    classesXml = shareCapital.classes.map(cls => `
          <ShareClass>
            <ClassName>${escapeXml(cls.className)}</ClassName>
            <PrescribedParticulars>${escapeXml(cls.prescribedParticulars)}</PrescribedParticulars>
            <NumberOfShares>${cls.numberOfShares}</NumberOfShares>
            <NominalValue>${cls.nominalValue.toFixed(2)}</NominalValue>
            <AmountPaidUp>${cls.amountPaidUp.toFixed(2)}</AmountPaidUp>
            <AmountUnpaid>${cls.amountUnpaid.toFixed(2)}</AmountUnpaid>
          </ShareClass>`).join('\n');
  }
  
  return `      <StatementOfCapital>
        <TotalNumberOfShares>${shareCapital.totalShares}</TotalNumberOfShares>
        <TotalAggregateNominalValue>${shareCapital.totalAggregateNominalValue.toFixed(2)}</TotalAggregateNominalValue>
        <Currency>${escapeXml(shareCapital.currency)}</Currency>
        <ShareClasses>${classesXml}
        </ShareClasses>
      </StatementOfCapital>`;
}

/**
 * Build registered office section if provided
 */
function buildRegisteredOfficeSection(office?: CS01XMLInput['registeredOffice']): string {
  if (!office) {
    return '';
  }
  
  return `      <RegisteredOffice>
        <AddressLine1>${escapeXml(office.addressLine1)}</AddressLine1>
${office.addressLine2 ? `        <AddressLine2>${escapeXml(office.addressLine2)}</AddressLine2>` : ''}
        <Locality>${escapeXml(office.locality)}</Locality>
${office.region ? `        <Region>${escapeXml(office.region)}</Region>` : ''}
        <PostalCode>${escapeXml(office.postalCode)}</PostalCode>
        <Country>${escapeXml(office.country)}</Country>
      </RegisteredOffice>`;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date for XML (YYYY-MM-DD)
 */
function formatDateForXML(dateStr: string): string {
  // Already in correct format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // Try to parse and format
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

/**
 * Parse CS01 submission response from Companies House
 */
export interface CS01ResponseResult {
  success: boolean;
  transactionId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
  message?: string;
  errors?: Array<{
    code: string;
    description: string;
    location?: string;
  }>;
  submissionNumber?: string;
}

/**
 * Parse Companies House XML response
 */
export function parseCS01Response(responseXml: string): CS01ResponseResult {
  try {
    // Simple XML parsing for key elements
    const getElement = (xml: string, tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const match = xml.match(regex);
      return match ? match[1] : null;
    };

    const getElements = (xml: string, tag: string): string[] => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'gi');
      const matches = xml.matchAll(regex);
      return Array.from(matches).map(m => m[1]);
    };

    // Check for errors
    const errorCodes = getElements(responseXml, 'ErrorCode');
    const errorDescriptions = getElements(responseXml, 'ErrorDescription');
    
    if (errorCodes.length > 0) {
      const errors = errorCodes.map((code, i) => ({
        code,
        description: errorDescriptions[i] || 'Unknown error',
      }));
      
      return {
        success: false,
        status: 'rejected',
        message: errors[0]?.description || 'Submission rejected',
        errors,
      };
    }

    // Check for success
    const qualifier = getElement(responseXml, 'Qualifier');
    const transactionId = getElement(responseXml, 'TransactionID');
    const submissionNumber = getElement(responseXml, 'SubmissionNumber');
    
    if (qualifier === 'acknowledgement' || qualifier === 'response') {
      return {
        success: true,
        status: submissionNumber ? 'accepted' : 'pending',
        transactionId: transactionId || undefined,
        submissionNumber: submissionNumber || undefined,
        message: submissionNumber ? 'Confirmation Statement accepted' : 'Submission received, awaiting processing',
      };
    }

    // Check for poll response
    if (qualifier === 'poll') {
      return {
        success: true,
        status: 'pending',
        transactionId: transactionId || undefined,
        message: 'Submission is being processed',
      };
    }

    return {
      success: false,
      status: 'error',
      message: 'Unexpected response format',
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: `Failed to parse response: ${err.message}`,
    };
  }
}

/**
 * Validate CS01 input before building XML
 */
export function validateCS01Input(input: Partial<CS01XMLInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!input.companyNumber) {
    errors.push('Company number is required');
  } else if (!/^[A-Z0-9]{8}$/i.test(input.companyNumber)) {
    errors.push('Company number must be 8 alphanumeric characters');
  }
  
  if (!input.companyName) {
    errors.push('Company name is required');
  }
  
  if (!input.madeUpToDate) {
    errors.push('Made up to date is required');
  }
  
  if (!input.presenter?.id) {
    errors.push('Presenter ID is required');
  }
  
  if (!input.presenter?.email) {
    errors.push('Presenter email is required');
  }
  
  if (!input.authCode) {
    errors.push('Company authentication code is required');
  }
  
  if (!input.confirmations) {
    errors.push('Confirmations are required');
  }
  
  return { valid: errors.length === 0, errors };
}
