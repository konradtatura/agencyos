-- Drop tables that only existed for the GHL funnel tracking script embed.
-- Visitor data is now pulled directly from the GHL API.

DROP TABLE IF EXISTS public.funnel_pageviews CASCADE;
DROP TABLE IF EXISTS public.page_leave_events CASCADE;
