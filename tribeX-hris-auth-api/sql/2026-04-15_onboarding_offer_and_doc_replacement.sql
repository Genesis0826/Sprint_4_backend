-- Migration: onboarding offer acceptance + document replacement requests
-- Run in Supabase SQL editor

-- 1. Add offer_accepted_at column to job_applications
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz;

-- 2. Create document_replacement_requests table
CREATE TABLE IF NOT EXISTS document_replacement_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid        NOT NULL REFERENCES employee_documents(id) ON DELETE CASCADE,
  employee_id       uuid        NOT NULL,
  new_file_url      text        NOT NULL,
  new_file_path     text,
  reason            text        NOT NULL,
  proof_url         text,
  status            text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  hr_notes          text,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by document and status
CREATE INDEX IF NOT EXISTS idx_doc_replacement_document_status
  ON document_replacement_requests (document_id, status);

-- Index for employee lookups
CREATE INDEX IF NOT EXISTS idx_doc_replacement_employee
  ON document_replacement_requests (employee_id);
