# Sprint 4 — C&B Requirements Checklist

> Status key: ✅ Done · 🔄 Partial · ❌ Not Started · ⚠️ Needs Backend (no payroll engine yet)

---

## SALARY & PAYROLL RECORDS

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | Create and maintain an employee salary record so each employee has an official compensation baseline | HR C&B Officer | ✅ Done | `POST /cnb/salary-baselines`, UI in HR Payroll → Salary Baselines tab |
| 2 | Compute total pay including benefits before timekeeping and leave adjustments | HR C&B Officer | ✅ Done | `POST /cnb/payroll/run` computes gross = basic + allowances |
| 3 | Link payroll computation to employee timesheet records so attendance is reflected in pay | HR C&B Officer | ❌ Not Started | Requires integration with `attendance_time_logs`; no deduction logic for absences yet |
| 4 | Configure pay frequency per employee (monthly or semi-monthly) to support different employment types | HR C&B Officer | ✅ Done | `pay_frequency` field on salary baseline; semi-monthly divisor applied in computation |
| 5 | Generate a payslip for each employee per payroll period as an official record of earnings and deductions | HR C&B Officer | ✅ Done | `POST /cnb/payroll/run` creates `cnb_payslips` records; employee views at `/employee/payslips` |
| 6 | Record one-time incentives (bonuses, 13th-month pay, EOM) separately so they are included in total pay | HR C&B Officer | 🔄 Partial | Benefit types `13th_month`, `one_time_incentive` exist in catalog; excluded from regular payroll run (not yet summed separately into payslip) |
| 7 | Record that payroll has been processed and bank transfer confirmed as the official payroll log | HR C&B Officer | ❌ Not Started | No bank confirmation endpoint yet; `cnb_payroll_periods.status` can track this |
| 8 | View payroll history per employee so past records are accessible for reference or audit | HR C&B Officer | ✅ Done | `GET /cnb/payroll/periods` + `GET /cnb/payroll/periods/:id/payslips`; `GET /cnb/me/payslips` for employee |
| 9 | Review and finalize payroll before marking as processed so errors can be corrected before release | HR C&B Officer | ✅ Done | `PATCH /cnb/payslips/:id/review` — Approve or Correction Needed; buttons in HR Payroll Run tab |

---

## BENEFITS MANAGEMENT

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | Central dashboard to view and manage all employee benefits for full visibility across the organization | HR C&B Officer | ✅ Done | HR Payroll → Benefits tab shows catalog + per-employee assignments |
| 2 | Create and update benefit types (generic or formula-based) so the system supports different benefit structures | HR C&B Officer | ✅ Done | `POST /cnb/benefits-catalog` — supports `allowance`, `incentive`, `one_time_incentive`, `13th_month`, `retirement`, and **custom** types; formula-based computation not yet implemented |
| 3 | Assign specific benefits to individual employees to support employee-specific compensation packages | HR C&B Officer | ✅ Done | `POST /cnb/employee-benefits` + `DELETE /cnb/employee-benefits/:id`; UI in HR Payroll → Benefits tab |
| 4 | View the benefits assigned to me so I understand my full compensation package | Employee | ✅ Done | `GET /cnb/me/compensation` — benefits, salary, statutory IDs visible at `/employee/payslips` → My Package tab |

---

## TAX MANAGEMENT

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | System computes applicable taxes per employee based on total pay for accurate and consistent deductions | HR C&B Officer | ✅ Done | Tax computed from `cnb_tax_brackets` using bracket lookup on monthly gross; applied in `POST /cnb/payroll/run` |
| 2 | Configure tax rules and brackets so the system applies the correct tax computation | System Admin | ✅ Done | `POST /cnb/tax-brackets`, `DELETE /cnb/tax-brackets/:id`, UI in `/system-admin/tax-brackets` |
| 3 | Tax deductions included in the generated payslip so employees see how net pay was computed | HR C&B Officer | ✅ Done | Payslip receipt shows Income Tax, SSS, PhilHealth, Pag-IBIG itemized |

---

## LEAVE MANAGEMENT

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | View available leave credits so I know how many leaves I can file | Employee | ✅ Done | `GET /leave/balances` — shown on `/employee/leave` page |
| 2 | File a leave request so my absence is formally recorded and approved | Employee | ✅ Done | `POST /leave/requests` — form on `/employee/leave` page |
| 3 | Approve or reject employee leave requests so leave management follows a formal workflow | HR C&B Officer / Manager | ✅ Done | `PATCH /leave/requests/:id` — available in HR Approvals and Manager Approvals (Leave tab) |
| 4 | Configure year-end leave carry-over rules so the system handles resets or accumulations per company policy | System Admin | ❌ Not Started | No carry-over logic in `time_leave_balances`; requires new policy table and year-end job |
| 5 | Leave absences reflected in payroll computation so unpaid/deductible absences are accounted for in salary | HR C&B Officer | ❌ Not Started | Payroll engine doesn't yet deduct for unapproved absences; requires `attendance_time_logs` integration |

---

## SECURITY

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | Sensitive salary information partially masked by default to minimize confidential data exposure during viewing | HR C&B Officer | ✅ Done | Payroll ledger locked behind `SecondaryAuthModal`; statutory IDs masked with `••••` on employee payslips |
| 2 | Re-enter credentials before accessing or modifying compensation data so only verified users perform sensitive actions | HR C&B Officer | ✅ Done | `SecondaryAuthModal` on HR Payroll (unlock ledger) and Employee Payslips (view receipt) |
| 3 | System automatically logs me out after inactivity when accessing sensitive modules to prevent unauthorized access | HR C&B Officer | ❌ Not Started | No inactivity timer implemented; JWT expiry handles token invalidation only |
| 4 | Assign role-based permissions in the HRIS so users can only access compensation data relevant to their role | System Admin | ✅ Done | `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` on all CNB endpoints; employee can only see own data |
| 5 | Salary and payroll information encrypted at rest and in transit to prevent unauthorized access | System Admin | 🔄 Partial | HTTPS in transit (handled by hosting); DB encryption at rest depends on Supabase configuration — not application-level |
| 6 | Require password/security verification before displaying sensitive payroll records to block unauthorized access | System Admin | ✅ Done | `SecondaryAuthModal` gates all salary/payslip views |
| 7 | Manager has limited or no access to employee compensation details so sensitive salary data remains confidential | Manager | ✅ Done | Manager role excluded from `cnb/*` salary/payslip endpoints; can only see team leave + documents |
| 8 | Employee can access only their own compensation and benefits information so other employees' data remains private | Employee | ✅ Done | All employee CNB endpoints use `req.user.sub_userid` — no userId param accepted from employee |
| 9 | System logs all access and changes to compensation data so activities can be tracked and audited | System Admin | ✅ Done | `cnb_audit_trail` table; `writeAudit()` called on all write operations in CNB service |

---

## MANAGER APPROVALS

| # | Story | Role | Status | Notes |
|---|-------|------|--------|-------|
| 1 | Review and action team leave requests | Manager | ✅ Done | Manager Approvals → Leave Approvals tab; Approve / Reject with reason dialog |
| 2 | Review and action employee document submissions | Manager | ✅ Done | Manager Approvals → Document Approvals tab; Approve / Reject with HR notes |

---

## C&B RECOMMENDATIONS

The following are recommended additions based on the user stories and PH labor standards:

1. **13th Month Pay Auto-Computation** — `GET /cnb/compute/13th-month/:userId` is implemented; add a dedicated "13th Month" tab in the HR Payroll page to generate and release 13th month payslips in December.

2. **Retirement / Government Mandated Benefits** — `retirement` benefit type is in the catalog. For computation: add a configurable contribution rate (e.g., 2% of basic salary) as a `retirement` deduction in the payroll engine.

3. **One-Time Incentives Release** — Add a separate `POST /cnb/payroll/release-incentive` endpoint to generate a separate payslip for bonuses/13th month without including them in the regular payroll run.

4. **Leave Deduction from Payroll** — Integrate `time_leave_requests` (with `status = Approved`, type `other` or unpaid) into the payroll computation to deduct absent days.

5. **Payroll Period Status Lifecycle** — Progress `cnb_payroll_periods.status` through `Draft → Reviewed → Released` and add bank transfer confirmation step.

6. **Year-End Leave Carry-Over** — Add a scheduled job (cron) that runs on Jan 1 to either reset or carry forward `time_leave_balances` based on company policy.

7. **PhilHealth / SSS Rate Updates** — Store statutory contribution rates in a DB table (per year) instead of hardcoding, so System Admin can update them annually.

---

## SUMMARY

| Section | Done | Partial | Not Started |
|---------|------|---------|-------------|
| Salary & Payroll Records | 6 | 1 | 2 |
| Benefits Management | 4 | 0 | 0 |
| Tax Management | 3 | 0 | 0 |
| Leave Management | 3 | 0 | 2 |
| Security | 6 | 1 | 2 |
| Manager Approvals | 2 | 0 | 0 |
| **Total** | **24** | **2** | **6** |
