-- Login attempts need a count by the address the trusted proxy recorded.
-- delete_user_sessions is SECURITY DEFINER, so it has to check the caller itself.

CREATE OR REPLACE FUNCTION failed_login_count_ip(p_ip text, p_window_seconds integer) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer
  FROM "LoginAttempt"
  WHERE ip = p_ip
    AND success = false
    AND "createdAt" > now() - make_interval(secs => p_window_seconds);
$$;

CREATE OR REPLACE FUNCTION delete_user_sessions(p_user_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := app_current_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_actor IS DISTINCT FROM p_user_id AND NOT EXISTS (
    SELECT 1
    FROM "User" actor
    JOIN "User" target ON target."orgId" = actor."orgId"
    WHERE actor.id = v_actor
      AND target.id = p_user_id
      AND actor.role = 'ADMIN'
      AND actor."deactivatedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM "Session" WHERE "userId" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION failed_login_count_ip(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION failed_login_count_ip(text, integer) TO crm_app;
ALTER FUNCTION failed_login_count_ip(text, integer) OWNER TO crm_definer;
ALTER FUNCTION delete_user_sessions(uuid) OWNER TO crm_definer;
