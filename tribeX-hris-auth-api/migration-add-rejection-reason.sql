-- Migration: Add rejection_reason to job_applications table
-- Date: 2026-03-31
-- Purpose: Allow HR to store reason when rejecting applicants

-- Add rejection_reason column to job_applications table
ALTER TABLE job_applications 
ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255);

-- Add comment to column
COMMENT ON COLUMN job_applications.rejection_reason IS 'Reason provided by HR when rejecting an application';

-- Optional: Add index if we want to query by rejection reasons
-- CREATE INDEX IF NOT EXISTS idx_job_applications_rejection_reason 
-- ON job_applications(rejection_reason) WHERE rejection_reason IS NOT NULL;
