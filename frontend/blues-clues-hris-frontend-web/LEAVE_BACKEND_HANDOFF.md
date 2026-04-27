# Leave Integration Handoff (Employee Self-Service)

## Implemented in frontend

The employee leave dashboard now uses available APIs:

- `POST /timekeeping/report-absence`
  - Used by "File a Leave" submit action
  - Body shape used:
    - `reason`: one of `Sick Leave | Emergency Leave | WFH / Remote | Personal Leave | Vacation Leave | On Leave (Approved) | Other`
    - `notes` (optional string)

- `GET /timekeeping/my-timesheet`
  - Used to render recent leave requests by reading rows with `absence` object.

## Missing backend endpoint (needed for full requirement)

To fully support "Leave Balance cards" (Vacation/Sick/etc remaining), frontend currently calls:

- `GET /timekeeping/leave-balances`

- `PATCH /timekeeping/leave-requests/:logId`
  - Used by HR Approval Inbox quick actions (Approve/Reject) for leave requests.
  - Proposed body: `{ "status": "approved" | "rejected" }`

Current frontend behavior if endpoint is missing (`404`):
- Cards render as "Not available yet".

## Expected response shape for `GET /timekeeping/leave-balances`

```json
[
  { "type": "Vacation", "remaining": 10, "total": 15 },
  { "type": "Sick", "remaining": 5, "total": 10 },
  { "type": "Emergency", "remaining": 2, "total": 3 },
  { "type": "Personal", "remaining": 1, "total": 2 }
]
```

## Notes

- No mock mode was added.
- No change-request API contracts were modified.
- This handoff is scoped only to the Employee Self-Service leave dashboard.

---

# Payroll and Directory Addendum

## Implemented in frontend

- `GET /users`, `GET /users/roles`, `GET /users/departments`
  - Used by HR Directory and Org Chart dashboards.
- `PATCH /users/:id`
  - Used by HR Directory quick edits for `role_id` and `department_id`.

- `GET /payroll/me/payslips`
  - Used by Employee Payslips dashboard.
  - If endpoint returns `404`, frontend falls back to sample rows so the page remains usable.

- `GET /payroll/ledger?cutoff=YYYY-MM-DD`
  - Used by HR Payroll Ledger dashboard.
  - If endpoint returns `404`, frontend falls back to sample rows.

- `POST /payroll/cutoff/run`
  - Used by HR Payroll Ledger "Run Cutoff" action.
  - Expected body: `{ "cutoff_date": "YYYY-MM-DD" }`

## Missing backend endpoints for full behavior

- `GET /payroll/me/payslips` (if not yet implemented)
- `GET /payroll/ledger` (if not yet implemented)
- `POST /payroll/cutoff/run` (if not yet implemented)

Current frontend behavior if any of the above endpoints are missing:
- `GET` endpoints: show fallback sample data.
- `POST /payroll/cutoff/run`: show explicit error toast that endpoint is not available yet.
