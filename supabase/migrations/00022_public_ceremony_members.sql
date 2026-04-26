-- 공개 시상식 페이지용 RPC 함수
-- SECURITY DEFINER로 RLS 우회, 이름/아바타만 팀별로 반환

CREATE OR REPLACE FUNCTION get_ceremony_members()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT json_object_agg(team_name, members_arr)
    FROM (
      SELECT
        upper(t.name) AS team_name,
        json_agg(json_build_object(
          'name', m.name,
          'avatar_url', m.avatar_url
        )) AS members_arr
      FROM members m
      JOIN teams t ON t.id = m.team_id
      WHERE m.active = true
        AND upper(t.name) IN ('RED', 'BLUE', 'GREEN', 'YELLOW')
      GROUP BY upper(t.name)
    ) sub
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_ceremony_members() TO anon, authenticated;
