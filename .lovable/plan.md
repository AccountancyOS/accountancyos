# AccountancyOS Review Document - Full Implementation Plan

## Document Source
Based on comprehensive review document: `AccountancyOS_review_1-2.docx`

---

## Implementation Status Legend
- ✅ **DONE** - Fully implemented
- 🔄 **PARTIAL** - Partially implemented, needs work
- ❌ **TODO** - Not yet implemented

---

# Phase 1: Overview/Dashboard Redesign

## 1.1 Notifications
| Change | Status | Notes |
|--------|--------|-------|
| Notifications should be clearable | ❌ TODO | Add dismiss/clear functionality |
| Remove emoji and !, replace with . | ✅ DONE | Professional tone enforced |

## 1.2 Setup Progress
| Change | Status | Notes |
|--------|--------|-------|
| Setup progress tasks should be skippable | ❌ TODO | Add skip button |
| Remove "Next Steps" section entirely | ❌ TODO | Remove from Overview |

## 1.3 Dashboard KPIs (Replace current layout)
| Change | Status | Notes |
|--------|--------|-------|
| Upcoming deadlines widget | 🔄 PARTIAL | Exists but needs refinement |
| Total number of clients | 🔄 PARTIAL | KPI card exists |
| Total number of leads | 🔄 PARTIAL | KPI card exists |
| Overdue action points (Conversations, Emails, Tasks) | 🔄 PARTIAL | Panel exists, needs SLA integration |
| Overdue deadlines (linked to services) | ❌ TODO | |
| Upcoming deadlines (with service linking) | 🔄 PARTIAL | |
| Firm current revenue (based on actual clients/fees) | ❌ TODO | |
| Lead revenue (based on unaccepted quotes) | ❌ TODO | |
| Staff variance table (owner sees all, staff sees own) | 🔄 PARTIAL | Component exists |

---

# Phase 2: CRM/Leads Page

## 2.1 Lead Type Dropdown
| Change | Status | Notes |
|--------|--------|-------|
| Lead type dropdown matches Client types | ✅ DONE | 8 types implemented |
| Types: SA non-MTD, SA MTD, Partnership, LLP, Limited Company, CGT, Charity, Other | ✅ DONE | |

## 2.2 Companies House Integration
| Change | Status | Notes |
|--------|--------|-------|
| CH lookup in CRM stage | ✅ DONE | CompaniesHouseLookupDialog exists |
| Data flows to Client page if lead won | ✅ DONE | lead-conversion-service handles this |

## 2.3 Quote Flow
| Change | Status | Notes |
|--------|--------|-------|
| Add "Send Quote" button next to Create Lead | ❌ TODO | Quick quote from CRM |
| Manage quotes from CRM page (declutter Quotes page) | ❌ TODO | UX consideration |
| Outstanding quotes visible in CRM column | ❌ TODO | |

## 2.4 Lead Lifecycle
| Change | Status | Notes |
|--------|--------|-------|
| Track dates when lead moves through stages | ❌ TODO | qualified_at, proposal_sent_at, etc. |
| Click into lead to see email history | 🔄 PARTIAL | LeadDetailPanel exists |
| Move to "Chasing" at 1st automated email chaser | ❌ TODO | Automation trigger |
| Lead → Client auto-creation on EL signing | ✅ DONE | lead-conversion-service |
| Consider removing "Qualified" column | ❌ TODO | UX simplification |

---

# Phase 3: Client Management

## 3.1 Client Types
| Change | Status | Notes |
|--------|--------|-------|
| 8 client types in dropdown | ✅ DONE | ClientTypeSelector component |
| Type filters on Clients page | ✅ DONE | ClientTypeFilters component |
| Type column in tables | ✅ DONE | |

## 3.2 Engagement Letter Tracking
| Change | Status | Notes |
|--------|--------|-------|
| All clients show date EL was last signed | ❌ TODO | Display in table/detail |

## 3.3 HMRC Authorisations
| Change | Status | Notes |
|--------|--------|-------|
| Personal HMRC auth location | ❌ TODO | |
| Company HMRC auth location | ❌ TODO | |
| PAYE HMRC auth location | ❌ TODO | |

## 3.4 Type-Specific Details Tabs

### Limited Company
| Field | Status | Notes |
|-------|--------|-------|
| Company name (from CH API) | ✅ DONE | |
| Incorporation date (from CH API) | ✅ DONE | |
| Year end date (from CH API) | ✅ DONE | |
| Trading status | ❌ TODO | |
| UTR | ✅ DONE | In companies table |
| SIC code (from CH API) | ✅ DONE | |
| Registered address | ✅ DONE | |
| Trading address | ❌ TODO | Separate field needed |
| Director details (name, DOB, address, NINO, UTR, CH personal code, nationality) | 🔄 PARTIAL | Basic director info exists |
| Partner in charge | ✅ DONE | |
| Staff in charge | ❌ TODO | |
| Internal reference | ✅ DONE | |
| Auth code | ✅ DONE | |
| Accounts due date | ❌ TODO | |
| CT600 due date | ❌ TODO | |
| Tax payable date | ❌ TODO | |

### LLP
| Field | Status | Notes |
|-------|--------|-------|
| Same as Ltd Co with partner details | 🔄 PARTIAL | |
| Nominated contacts/minimum partners | ❌ TODO | |

### Partnership
| Field | Status | Notes |
|-------|--------|-------|
| Partnership UTR | ✅ DONE | client_detail_partnership |
| Partnership address | ❌ TODO | |
| Partner details (min 2 partners) | ❌ TODO | |

### Self-Assessment (non-MTD)
| Field | Status | Notes |
|-------|--------|-------|
| DOB | ❌ TODO | |
| UTR | ✅ DONE | client_detail_sa |
| NINO | ✅ DONE | client_detail_sa |
| Address | ❌ TODO | |
| Preferred name | ❌ TODO | |
| Mobile number | 🔄 PARTIAL | phone field exists |
| CH personal code (if linked to company) | ❌ TODO | |

### Self-Assessment (MTD)
| Field | Status | Notes |
|-------|--------|-------|
| Same as non-MTD | 🔄 PARTIAL | |
| MTD quarter deadlines | ❌ TODO | |
| MTD final declaration deadlines | ❌ TODO | |

### Capital Gains Tax
| Field | Status | Notes |
|-------|--------|-------|
| Individual name | ✅ DONE | |
| NINO | ✅ DONE | client_detail_cgt |
| CGT number | ✅ DONE | client_detail_cgt |
| Home address | ❌ TODO | |
| Property address | ✅ DONE | client_detail_cgt |

### Charity
| Field | Status | Notes |
|-------|--------|-------|
| Charity number | ✅ DONE | client_detail_charity |
| Charity status | ❌ TODO | |
| Incorporation date | ❌ TODO | |
| Trading as | ❌ TODO | |
| Charity accounts YE | ❌ TODO | |
| Charity commission submission due | ❌ TODO | |

---

# Phase 4: Client Portal Tabs

## 4.1 Conversations Page
| Change | Status | Notes |
|--------|--------|-------|
| History of emails, in-app messages, internal messages | 🔄 PARTIAL | ConversationsTab exists |
| Tag messages to jobs | ❌ TODO | |
| Link to response time SLA | ❌ TODO | |
| Reply to email like normal email | 🔄 PARTIAL | |
| Group conversations by tag/job | ❌ TODO | |
| Archive option | ❌ TODO | |
| Persist filter setting | ❌ TODO | |
| Default to Primary contact | ❌ TODO | |

## 4.2 Documents Page
| Change | Status | Notes |
|--------|--------|-------|
| Accountant upload with client visible toggle | ❌ TODO | |
| Signature required toggle | ❌ TODO | |
| Delete multiple documents at once | ❌ TODO | |
| Auto-archive after 7 years | ❌ TODO | |
| Audit trail (who uploaded, when, who signed, when) | ❌ TODO | |
| Mandatory scroll before signature | ❌ TODO | |
| Signature bar greyed until scroll complete | ❌ TODO | |

## 4.3 Contacts Page
| Change | Status | Notes |
|--------|--------|-------|
| Add other individuals to account | 🔄 PARTIAL | ContactsList exists |
| Director contact type with document signer toggle | ❌ TODO | |
| Make primary contact option | ❌ TODO | |
| Bookkeeper contact type (limited visibility) | ❌ TODO | |
| Other contact type | ❌ TODO | |
| Remove Finance Director/Secretary/Personal types | ❌ TODO | |

## 4.4 Questionnaire Tab
| Change | Status | Notes |
|--------|--------|-------|
| View/add questionnaires | 🔄 PARTIAL | ClientQuestionnairesTab exists |
| Notice if no templates created | ❌ TODO | |
| Link questionnaire to job | ❌ TODO | |
| Replace "Period label" with "Linked Job" | ❌ TODO | |
| Show To Be Completed/Completed status | 🔄 PARTIAL | |
| Completion date links to job progress | ❌ TODO | |
| Template email queued on send | 🔄 PARTIAL | |

## 4.5 Workpapers Tab
| Change | Status | Notes |
|--------|--------|-------|
| View current and old workpapers | 🔄 PARTIAL | ClientWorkpapersTab exists |
| Create workpaper (notice if no template) | ❌ TODO | |
| Auto-create from bookkeeping + questionnaire | 🔄 PARTIAL | |
| Active/Completed status | ❌ TODO | |
| Lock on submission to CH/HMRC | ❌ TODO | |
| Unlock for amendments | ❌ TODO | |

## 4.6 Deadlines Tab
| Change | Status | Notes |
|--------|--------|-------|
| Show upcoming deadlines for services/jobs | 🔄 PARTIAL | ClientDeadlinesTab exists |
| SA non-MTD deadlines | ✅ DONE | deadline-engine |
| SA MTD deadlines (quarterly + final) | ❌ TODO | |
| Payment triggers (31 Jan, 31 Jul) | ❌ TODO | |
| Limited company deadlines (Accounts, CT600, CT payment, CS) | 🔄 PARTIAL | |
| LLP deadlines | ❌ TODO | |
| VAT deadlines | 🔄 PARTIAL | |
| PAYE deadlines | ❌ TODO | |
| Partnership deadlines | ❌ TODO | |
| Charity deadlines | ❌ TODO | |
| CGT deadlines (60 days from completion) | ❌ TODO | |

## 4.7 Services Tab
| Change | Status | Notes |
|--------|--------|-------|
| Pre-populated standard services list | 🔄 PARTIAL | |
| Services: Accounts, CT600, CS, Bookkeeping, VAT, Payroll, CIS, MTD quarterly, MTD final, Registered address, Advisory, Software, CGT, SA | ❌ TODO | Full list |
| Fees pull through from quote | ❌ TODO | |
| One-off vs Monthly toggle | ❌ TODO | |
| Toggle services on/off later | ❌ TODO | |
| Client-specific fee updates | ❌ TODO | |
| New service/fee change triggers new EL | ❌ TODO | |
| Total fees summary (one-off vs monthly) | ❌ TODO | |

## 4.8 Billing Tab
| Change | Status | Notes |
|--------|--------|-------|
| Quote history (accepted/rejected) | ❌ TODO | |
| Quote acceptance dates | ❌ TODO | |
| Invoice history | ❌ TODO | |
| Payment history | ❌ TODO | |
| Filter by calendar year | ❌ TODO | |
| Total billing visibility | ❌ TODO | |

## 4.9 Settings Tab
| Change | Status | Notes |
|--------|--------|-------|
| Adjust automations per client | ❌ TODO | |

---

# Phase 5: Service-Specific Fields

## 5.1 PAYE Service Fields
| Field | Status | Notes |
|-------|--------|-------|
| Employers reference | ❌ TODO | |
| Accounts office reference | ❌ TODO | |
| Tax year | ❌ TODO | |
| RTI deadline (auto) | ❌ TODO | |
| Pension declaration date | ❌ TODO | |

## 5.2 Pension Service Fields
| Field | Status | Notes |
|-------|--------|-------|
| Pension provider | ❌ TODO | |
| Pension number | ❌ TODO | |
| Auto enrolment staging | ❌ TODO | |

## 5.3 VAT Service Fields
| Field | Status | Notes |
|-------|--------|-------|
| VAT number | ✅ DONE | vat_settings table |
| VAT quarters | ✅ DONE | |
| VAT member state | ❌ TODO | |
| Date of registration | ❌ TODO | |
| Effective date | ❌ TODO | |

---

# Phase 6: Deadline Engine Enhancements

| Deadline Type | Calculation | Status |
|--------------|-------------|--------|
| SA non-MTD | 31 January filing + payment | ✅ DONE |
| SA MTD quarterly | 1 month 7 days after quarter end | ❌ TODO |
| SA MTD end of period | 31 January | ❌ TODO |
| SA MTD final declaration | 31 January | ❌ TODO |
| SA payments on account | 31 Jan + 31 Jul | ❌ TODO |
| Ltd Co Accounts | ARD + 9 months | ✅ DONE |
| CT600 | 12 months after YE | ✅ DONE |
| Corporation tax due | ARD + 9 months + 1 day | ❌ TODO |
| Confirmation Statement | Per CH | 🔄 PARTIAL |
| LLP Accounts | Per CH | ❌ TODO |
| Partnership return | 31 January | ❌ TODO |
| VAT | Period end + 37 days | ✅ DONE |
| PAYE RTI | On or before payday | ❌ TODO |
| PAYE payment | 22nd following month | ❌ TODO |
| EPS | 19th following month | ❌ TODO |
| Pension | 22nd following month | ❌ TODO |
| P60 | 31 May | ❌ TODO |
| Charity annual return | YE + 10 months | ❌ TODO |
| Charity accounts | YE + 10 months | ❌ TODO |
| Charity accounts (CH) | YE + 9 months | ❌ TODO |
| CGT return | Completion + 60 days | ❌ TODO |

---

# Implementation Priority Order

## Immediate (This Session)
1. ❌ Remove "Next Steps" section from Overview
2. ❌ Make notifications clearable
3. ❌ Make setup progress skippable

## High Priority (Next)
4. ❌ Add missing client detail fields (DOB, trading address, etc.)
5. ❌ Service-specific fields (PAYE, Pension, VAT)
6. ❌ Lead stage date tracking
7. ❌ Engagement letter date display

## Medium Priority
8. ❌ Full deadline engine enhancements
9. ❌ Services tab with fees
10. ❌ Billing tab

## Lower Priority
11. ❌ Document signature workflow
12. ❌ Conversation grouping/archiving
13. ❌ Quote management in CRM

