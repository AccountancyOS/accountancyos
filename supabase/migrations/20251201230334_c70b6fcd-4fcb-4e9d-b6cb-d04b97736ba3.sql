-- Clear all test data for fresh start
-- Preserves: organizations, organization_users, services_catalog, templates

-- 1. Financial data (deepest dependencies first)
DELETE FROM ledger_entries;
DELETE FROM invoice_payments;
DELETE FROM invoice_lines;
DELETE FROM bank_transactions;

-- 2. Jobs & Filings (child records first)
DELETE FROM job_documents;
DELETE FROM job_conversations;
DELETE FROM job_tasks;
DELETE FROM job_timeline;
DELETE FROM filings;
DELETE FROM workpaper_instances;
DELETE FROM trial_balance_snapshots;
DELETE FROM jobs;

-- 3. Client Portal & Communications
DELETE FROM portal_access;
DELETE FROM client_messages;
DELETE FROM client_tasks;

-- 4. Onboarding & Quotes
DELETE FROM engagement_letters;
DELETE FROM onboarding_applications;
DELETE FROM quote_lines;
DELETE FROM quotes;

-- 5. Engagements & Deadlines
DELETE FROM engagements;
DELETE FROM deadlines;

-- 6. Banking & Bookkeeping
DELETE FROM invoices;
DELETE FROM bank_connections;
DELETE FROM bank_accounts;
DELETE FROM bookkeeping_accounts;
DELETE FROM categorization_rules;

-- 7. Core entities
DELETE FROM companies;
DELETE FROM clients;
DELETE FROM leads;

-- 8. System cleanup
DELETE FROM email_queue;
DELETE FROM audit_log;

-- Confirm what remains
SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'organization_users', COUNT(*) FROM organization_users
UNION ALL
SELECT 'services_catalog', COUNT(*) FROM services_catalog
UNION ALL
SELECT 'templates', COUNT(*) FROM templates
ORDER BY table_name;