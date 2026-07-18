-- ============================================================
-- YAWMATIC Control Center Supabase Realtime Setup
-- ============================================================

-- 1. Enable replication identity FULL for target tables
-- This ensures that UPDATE and DELETE events contain old data values in the payload
ALTER TABLE public.creator_applications REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.reviews REPLICA IDENTITY FULL;
ALTER TABLE public.inquiries REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- 2. Configure publication for Supabase Realtime
-- Drop the publication if it already exists to recreate it cleanly with the desired tables
DROP PUBLICATION IF EXISTS supabase_realtime;

CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.creator_applications,
  public.projects,
  public.reviews,
  public.inquiries,
  public.notifications,
  public.messages;
