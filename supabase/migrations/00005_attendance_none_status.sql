-- Add 'none' value to attendance_status enum for "미기록" state
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'none';
