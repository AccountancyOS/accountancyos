In `src/components/client-portal/ServiceStatusDashboard.tsx`:

1. Remove the `{eng.frequency} · since {eng.start_date}` subtitle line entirely (lines 96–98).
2. Replace `Latest job: <status>` rendering so that when status is `blank`, falsy, or unrecognised, it shows `None` instead. Format via `formatStatus` (Title Case) for everything else: `Latest Job: {status === "blank" || !status ? "None" : formatStatus(status)}`.

No other files affected.