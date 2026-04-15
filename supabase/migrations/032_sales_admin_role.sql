-- Add 'sales_admin' to the role check constraints

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'creator', 'setter', 'closer', 'sales_admin'));

ALTER TABLE public.team_members
  DROP CONSTRAINT IF EXISTS team_members_role_check,
  ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('setter', 'closer', 'sales_admin'));
