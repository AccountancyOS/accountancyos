### Summary
Remove the redundant "CRM Setup" step from the onboarding wizard since AccountancyOS has a built-in CRM that requires no external connection.

### Current Issue
Step 5 of the wizard is labeled "CRM Setup — Connect your CRM". In practice it only renders a card explaining the CRM is built-in and has a no-op "Continue" button. This wastes user time and implies an external integration is needed.

### Changes

1. **OnboardingWizard.tsx**
   - Remove `{ id: 5, name: "CRM Setup", description: "Connect your CRM" }` from the `STEPS` array.
   - Remove `import { CRMSetupStep }`.
   - Remove the `currentStep === 5` rendering block for `<CRMSetupStep .../>`.
   - Renumber: `DataImportStep` is now rendered at step 5 (was 6).

2. **Delete CRMSetupStep.tsx**
   - The component has no meaningful logic and no other callers. Remove it entirely.

### Result
- Wizard drops from 6 steps to 5: Practice Profile, Practice Setup, Compliance Setup, Team Setup, Data Import.
- All step navigation, progress bar math, and "Step X of Y" labels update automatically because they reference `STEPS.length` and `STEPS[currentStep - 1]`.