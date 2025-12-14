// VAT Return Model Mapper
// Maps workpaper/ledger data to HMRC MTD VAT return format

export interface VATReturnModel {
  periodKey: string;
  vatDueSales: number; // Box 1
  vatDueAcquisitions: number; // Box 2
  totalVatDue: number; // Box 3 (calculated: Box 1 + Box 2)
  vatReclaimedCurrPeriod: number; // Box 4
  netVatDue: number; // Box 5 (calculated: |Box 3 - Box 4|)
  totalValueSalesExVAT: number; // Box 6
  totalValuePurchasesExVAT: number; // Box 7
  totalValueGoodsSuppliedExVAT: number; // Box 8
  totalAcquisitionsExVAT: number; // Box 9
  finalised: boolean;
}

export interface VATModelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface VATWorkpaperData {
  box1_vat_on_sales?: number;
  box2_vat_on_acquisitions?: number;
  box4_vat_reclaimed?: number;
  box6_total_sales_ex_vat?: number;
  box7_total_purchases_ex_vat?: number;
  box8_goods_supplied_ex_vat?: number;
  box9_acquisitions_ex_vat?: number;
  period_key?: string;
}

/**
 * Map workpaper data to VAT return model
 */
export function mapWorkpaperToVATModel(
  workpaperData: VATWorkpaperData,
  periodKey: string
): VATReturnModel {
  const box1 = Number(workpaperData.box1_vat_on_sales || 0);
  const box2 = Number(workpaperData.box2_vat_on_acquisitions || 0);
  const box4 = Number(workpaperData.box4_vat_reclaimed || 0);
  const box6 = Number(workpaperData.box6_total_sales_ex_vat || 0);
  const box7 = Number(workpaperData.box7_total_purchases_ex_vat || 0);
  const box8 = Number(workpaperData.box8_goods_supplied_ex_vat || 0);
  const box9 = Number(workpaperData.box9_acquisitions_ex_vat || 0);
  
  // Box 3 = Box 1 + Box 2
  const box3 = box1 + box2;
  
  // Box 5 = |Box 3 - Box 4| (always positive per HMRC)
  const box5 = Math.abs(box3 - box4);
  
  return {
    periodKey,
    vatDueSales: roundToTwoDecimals(box1),
    vatDueAcquisitions: roundToTwoDecimals(box2),
    totalVatDue: roundToTwoDecimals(box3),
    vatReclaimedCurrPeriod: roundToTwoDecimals(box4),
    netVatDue: roundToTwoDecimals(box5),
    totalValueSalesExVAT: roundToWholeNumber(box6),
    totalValuePurchasesExVAT: roundToWholeNumber(box7),
    totalValueGoodsSuppliedExVAT: roundToWholeNumber(box8),
    totalAcquisitionsExVAT: roundToWholeNumber(box9),
    finalised: true,
  };
}

/**
 * Validate VAT return model against HMRC rules
 */
export function validateVATModel(model: VATReturnModel): VATModelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Box 3 must equal Box 1 + Box 2
  const expectedBox3 = model.vatDueSales + model.vatDueAcquisitions;
  if (Math.abs(model.totalVatDue - expectedBox3) > 0.01) {
    errors.push(`Box 3 (${model.totalVatDue}) must equal Box 1 + Box 2 (${expectedBox3})`);
  }
  
  // Box 5 must equal |Box 3 - Box 4|
  const expectedBox5 = Math.abs(model.totalVatDue - model.vatReclaimedCurrPeriod);
  if (Math.abs(model.netVatDue - expectedBox5) > 0.01) {
    errors.push(`Box 5 (${model.netVatDue}) must equal |Box 3 - Box 4| (${expectedBox5})`);
  }
  
  // Boxes 1-5 must be to 2 decimal places
  if (!isValidDecimalPlaces(model.vatDueSales, 2)) {
    errors.push('Box 1 must have at most 2 decimal places');
  }
  if (!isValidDecimalPlaces(model.vatDueAcquisitions, 2)) {
    errors.push('Box 2 must have at most 2 decimal places');
  }
  if (!isValidDecimalPlaces(model.totalVatDue, 2)) {
    errors.push('Box 3 must have at most 2 decimal places');
  }
  if (!isValidDecimalPlaces(model.vatReclaimedCurrPeriod, 2)) {
    errors.push('Box 4 must have at most 2 decimal places');
  }
  if (!isValidDecimalPlaces(model.netVatDue, 2)) {
    errors.push('Box 5 must have at most 2 decimal places');
  }
  
  // Boxes 6-9 must be whole pounds
  if (!Number.isInteger(model.totalValueSalesExVAT)) {
    errors.push('Box 6 must be a whole number');
  }
  if (!Number.isInteger(model.totalValuePurchasesExVAT)) {
    errors.push('Box 7 must be a whole number');
  }
  if (!Number.isInteger(model.totalValueGoodsSuppliedExVAT)) {
    errors.push('Box 8 must be a whole number');
  }
  if (!Number.isInteger(model.totalAcquisitionsExVAT)) {
    errors.push('Box 9 must be a whole number');
  }
  
  // Negative value warnings (allowed but unusual)
  if (model.vatDueSales < 0) {
    warnings.push('Box 1 is negative - verify this is correct');
  }
  if (model.totalValueSalesExVAT < 0) {
    warnings.push('Box 6 is negative - verify this is correct');
  }
  
  // Period key format check
  if (!model.periodKey || !/^[0-9A-Z#]{4}$/.test(model.periodKey)) {
    errors.push('Invalid period key format');
  }
  
  // Maximum value checks (HMRC limit: 9999999999999.99)
  const maxValue = 9999999999999.99;
  if (model.vatDueSales > maxValue || model.vatDueAcquisitions > maxValue ||
      model.totalVatDue > maxValue || model.vatReclaimedCurrPeriod > maxValue ||
      model.netVatDue > maxValue || model.totalValueSalesExVAT > maxValue ||
      model.totalValuePurchasesExVAT > maxValue || model.totalValueGoodsSuppliedExVAT > maxValue ||
      model.totalAcquisitionsExVAT > maxValue) {
    errors.push('One or more values exceeds HMRC maximum');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Build HMRC VAT return payload from model
 */
export function buildHMRCVATPayload(model: VATReturnModel): object {
  return {
    periodKey: model.periodKey,
    vatDueSales: model.vatDueSales,
    vatDueAcquisitions: model.vatDueAcquisitions,
    totalVatDue: model.totalVatDue,
    vatReclaimedCurrPeriod: model.vatReclaimedCurrPeriod,
    netVatDue: model.netVatDue,
    totalValueSalesExVAT: model.totalValueSalesExVAT,
    totalValuePurchasesExVAT: model.totalValuePurchasesExVAT,
    totalValueGoodsSuppliedExVAT: model.totalValueGoodsSuppliedExVAT,
    totalAcquisitionsExVAT: model.totalAcquisitionsExVAT,
    finalised: model.finalised,
  };
}

// Helper functions
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToWholeNumber(value: number): number {
  return Math.round(value);
}

function isValidDecimalPlaces(value: number, maxDecimals: number): boolean {
  const multiplier = Math.pow(10, maxDecimals);
  return Math.abs(value * multiplier - Math.round(value * multiplier)) < 0.0001;
}
