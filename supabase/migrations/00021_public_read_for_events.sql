-- 공개 이벤트 페이지용 RPC 함수
-- SECURITY DEFINER로 RLS를 우회하되, 이벤트 참가자 정보만 제한적으로 반환
-- members/teachers RLS는 authenticated 유지 (변경 없음)

CREATE OR REPLACE FUNCTION get_public_event(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event json;
  v_participants json;
BEGIN
  -- 이벤트 조회 (visibility=true, status가 upcoming/active인 것만)
  SELECT row_to_json(e) INTO v_event
  FROM (
    SELECT id, name, description, start_date, end_date, status, metadata
    FROM events
    WHERE id = p_event_id
      AND visibility = true
      AND status IN ('upcoming', 'active')
  ) e;

  IF v_event IS NULL THEN
    RETURN NULL;
  END IF;

  -- 참가자 조회 (이름, 아바타, 생일, 성별만 노출 - 연락처 등 제외)
  SELECT json_agg(row_to_json(p)) INTO v_participants
  FROM (
    SELECT
      ep.id,
      ep.event_id,
      ep.member_id,
      ep.teacher_id,
      ep.club_type,
      ep.role,
      ep.sub_group,
      CASE WHEN ep.member_id IS NOT NULL THEN json_build_object(
        'id', m.id,
        'name', m.name,
        'avatar_url', m.avatar_url,
        'birthday', m.birthday,
        'gender', m.gender
      ) END AS member,
      CASE WHEN ep.teacher_id IS NOT NULL THEN json_build_object(
        'id', t.id,
        'name', t.name,
        'avatar_url', t.avatar_url
      ) END AS teacher
    FROM event_participants ep
    LEFT JOIN members m ON m.id = ep.member_id
    LEFT JOIN teachers t ON t.id = ep.teacher_id
    WHERE ep.event_id = p_event_id
    ORDER BY ep.role, ep.created_at
  ) p;

  RETURN json_build_object(
    'event', v_event,
    'participants', COALESCE(v_participants, '[]'::json)
  );
END;
$$;
