/**
 * HMRC Error Normalization
 * Provides consistent error shapes from HMRC API responses
 */

export interface HmrcNormalizedError {
  code: string;
  message: string;
  details?: string;
  retryable: boolean;
  httpStatus?: number;
}

/**
 * Known HMRC error codes and their user-friendly messages
 */
const HMRC_ERROR_MAP: Record<string, { message: string; retryable: boolean }> = {
  // Authentication errors
  'INVALID_CREDENTIALS': { message: 'HMRC credentials are invalid', retryable: false },
  'INVALID_TOKEN': { message: 'HMRC access token is invalid or expired', retryable: false },
  'FORBIDDEN': { message: 'Access denied to HMRC service', retryable: false },
  
  // Rate limiting
  'MESSAGE_THROTTLED_OUT': { message: 'HMRC rate limit exceeded - please wait before retrying', retryable: true },
  'TOO_MANY_REQUESTS': { message: 'Too many requests to HMRC - please wait', retryable: true },
  
  // Validation errors
  'INVALID_REQUEST': { message: 'Invalid request format', retryable: false },
  'INVALID_PAYLOAD': { message: 'Invalid data in submission', retryable: false },
  'INVALID_DATE': { message: 'Invalid date format in submission', retryable: false },
  'INVALID_PERIOD': { message: 'Invalid accounting period', retryable: false },
  'INVALID_VRN': { message: 'Invalid VAT Registration Number', retryable: false },
  'INVALID_UTR': { message: 'Invalid Unique Taxpayer Reference', retryable: false },
  
  // Business logic errors
  'DUPLICATE_SUBMISSION': { message: 'This return has already been submitted', retryable: false },
  'PERIOD_ALREADY_SUBMITTED': { message: 'A return for this period has already been submitted', retryable: false },
  'NOT_FOUND': { message: 'Submission not found', retryable: false },
  'OBLIGATION_NOT_FOUND': { message: 'No obligation found for this period', retryable: false },
  
  // Processing errors
  'INTERNAL_SERVER_ERROR': { message: 'HMRC is experiencing technical difficulties', retryable: true },
  'SERVICE_UNAVAILABLE': { message: 'HMRC service is temporarily unavailable', retryable: true },
  'GATEWAY_TIMEOUT': { message: 'HMRC service timed out', retryable: true },
  'BAD_GATEWAY': { message: 'Unable to connect to HMRC', retryable: true },
  
  // GovTalk specific
  'business': { message: 'HMRC rejected the submission due to business rules', retryable: false },
  'fatal': { message: 'HMRC encountered a fatal error processing the submission', retryable: false },
  'recoverable': { message: 'HMRC encountered a recoverable error', retryable: true },
  'acknowledgement': { message: 'Submission acknowledged - poll for result', retryable: false },
};

/**
 * Normalize an HMRC API error response
 */
export function normalizeHmrcError(
  response: {
    status?: number;
    body?: any;
    errorText?: string;
  }
): HmrcNormalizedError {
  const { status, body, errorText } = response;
  
  // Handle HTTP status-based errors
  if (status) {
    if (status === 401 || status === 403) {
      return {
        code: 'HMRC_AUTH_ERROR',
        message: 'HMRC authentication failed - please reconnect your HMRC account',
        retryable: false,
        httpStatus: status,
      };
    }
    
    if (status === 429) {
      return {
        code: 'HMRC_RATE_LIMITED',
        message: 'HMRC rate limit exceeded - please wait before retrying',
        retryable: true,
        httpStatus: status,
      };
    }
    
    if (status >= 500) {
      return {
        code: 'HMRC_SERVER_ERROR',
        message: 'HMRC is experiencing technical difficulties - please try again later',
        retryable: true,
        httpStatus: status,
      };
    }
  }
  
  // Try to extract error code from body
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  
  if (body) {
    // REST API format
    if (body.code) {
      errorCode = body.code;
      errorMessage = body.message;
    }
    // GovTalk format
    else if (body.Qualifier) {
      errorCode = body.Qualifier;
      errorMessage = body.Text || body.Message;
    }
    // Error array format
    else if (Array.isArray(body.errors)) {
      const firstError = body.errors[0];
      errorCode = firstError?.code;
      errorMessage = firstError?.message;
    }
  }
  
  // Try to parse error from text
  if (!errorCode && errorText) {
    // Check for known patterns in error text
    if (errorText.includes('INVALID_CREDENTIALS')) {
      errorCode = 'INVALID_CREDENTIALS';
    } else if (errorText.includes('throttle') || errorText.includes('rate limit')) {
      errorCode = 'MESSAGE_THROTTLED_OUT';
    } else if (errorText.includes('duplicate')) {
      errorCode = 'DUPLICATE_SUBMISSION';
    }
  }
  
  // Look up known error
  if (errorCode && HMRC_ERROR_MAP[errorCode]) {
    const mapped = HMRC_ERROR_MAP[errorCode];
    return {
      code: errorCode,
      message: mapped.message,
      details: errorMessage || errorText,
      retryable: mapped.retryable,
      httpStatus: status,
    };
  }
  
  // Return generic error
  return {
    code: errorCode || 'HMRC_UNKNOWN_ERROR',
    message: errorMessage || 'An unexpected error occurred with HMRC',
    details: errorText?.substring(0, 500),
    retryable: false,
    httpStatus: status,
  };
}

/**
 * Parse GovTalk XML response for errors
 * Used for CT600 and other XML-based submissions
 */
export function parseGovTalkErrors(xml: string): HmrcNormalizedError[] {
  const errors: HmrcNormalizedError[] = [];
  
  // Extract qualifier
  const qualifierMatch = xml.match(/<Qualifier>(\w+)<\/Qualifier>/i);
  const qualifier = qualifierMatch?.[1]?.toLowerCase();
  
  // Extract error elements
  const errorPattern = /<Error[^>]*>[\s\S]*?<\/Error>/gi;
  const errorMatches = xml.matchAll(errorPattern);
  
  for (const match of errorMatches) {
    const errorXml = match[0];
    
    const typeMatch = errorXml.match(/<Type>([^<]+)<\/Type>/i);
    const textMatch = errorXml.match(/<Text>([^<]+)<\/Text>/i);
    const locationMatch = errorXml.match(/<Location>([^<]+)<\/Location>/i);
    
    const errorType = typeMatch?.[1] || 'unknown';
    const errorText = textMatch?.[1] || 'Unknown error';
    const location = locationMatch?.[1];
    
    const mapped = HMRC_ERROR_MAP[errorType] || HMRC_ERROR_MAP[qualifier || ''];
    
    errors.push({
      code: errorType.toUpperCase(),
      message: mapped?.message || errorText,
      details: location ? `Location: ${location}. ${errorText}` : errorText,
      retryable: mapped?.retryable ?? (qualifier === 'recoverable'),
    });
  }
  
  // If no specific errors found but we have a qualifier
  if (errors.length === 0 && qualifier) {
    const mapped = HMRC_ERROR_MAP[qualifier];
    if (mapped) {
      errors.push({
        code: qualifier.toUpperCase(),
        message: mapped.message,
        retryable: mapped.retryable,
      });
    }
  }
  
  return errors;
}

/**
 * Check if an HMRC error indicates re-authorization is needed
 */
export function requiresReauthorization(error: HmrcNormalizedError): boolean {
  const reAuthCodes = [
    'INVALID_TOKEN',
    'INVALID_CREDENTIALS',
    'HMRC_AUTH_ERROR',
    'HMRC_REAUTH_REQUIRED',
    'FORBIDDEN',
  ];
  return reAuthCodes.includes(error.code);
}

/**
 * Format HMRC errors for user display
 */
export function formatHmrcErrorForUser(error: HmrcNormalizedError): string {
  let message = error.message;
  
  if (error.retryable) {
    message += ' Please try again in a few minutes.';
  }
  
  if (requiresReauthorization(error)) {
    message += ' You may need to reconnect your HMRC account in Settings.';
  }
  
  return message;
}
