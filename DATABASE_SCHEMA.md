# Awana Club Management System - Database Schema v3 (Final)

## 개요

어와나 클럽 관리 시스템의 전체 데이터베이스 스키마입니다.
Supabase(PostgreSQL) 기반이며, 간소화된 RLS를 적용합니다.

### 핵심 워크플로우

```
[학생 등록]
  방법1: 학생이 직접 가입 → pending 대기 → 교사가 팀/룸 배정 후 승인 → active
  방법2: 교사가 직접 학생 정보 입력 → 바로 active + 팀 배정

[매주 훈련일]
  교사가 룸(=팀)에서 학생별 점수 입력 (출석/핸드북/단복/암송)
    → 교사 검토 후 "제출" (draft → submitted)
    → 관리자가 전체 취합 점수 확인 후 "승인" (submitted → approved)
    → 반려 시 draft로 되돌아감 → 교사가 바로 수정 후 재제출 가능
    → 승인된 점수로 시상 결정

[시상식 데이터]
  2 클럽 × 4 팀 × 2 점수종류(핸드북/게임) = 16개 점수
    → 시상식 웹페이지로 전달
```

---

## 1. Enum Types

| Enum | 값 | 설명 |
|------|-----|------|
| `club_type` | `sparks`, `tnt` | 클럽 종류 |
| `user_role` | `admin`, `teacher` | 사용자 역할 |
| `enrollment_status` | `pending`, `active`, `inactive` | 학생 등록 상태 |
| `attendance_status` | `present`, `late`, `absent` | 출석 상태 |
| `scoring_category` | `attendance`, `handbook`, `uniform`, `recitation` | 점수 카테고리 |
| `badge_type` | `handbook_completion`, `attendance_perfect`, `memorization`, `special`, `custom` | 뱃지 종류 |
| `submission_status` | `draft`, `submitted`, `approved`, `rejected` | 점수 제출 상태 |

---

## 2. 기본 테이블 (Base Tables)

### 2.1 `clubs` - 클럽

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `name` | text | NOT NULL | 클럽 이름 ("스팍스", "티앤티") |
| `type` | club_type | NOT NULL, UNIQUE | 클럽 종류 |
| `logo_url` | text | NULL | 로고 URL |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

### 2.2 `teachers` - 교사

`auth.users`와 1:1 연결. 회원가입 시 자동 생성.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `user_id` | uuid | UNIQUE, REFERENCES auth.users | Supabase Auth ID |
| `club_id` | uuid | NULL, REFERENCES clubs | 소속 클럽 |
| `name` | text | NOT NULL | 이름 |
| `phone` | text | NULL | 전화번호 |
| `role` | user_role | NOT NULL, DEFAULT 'teacher' | 역할 |
| `active` | boolean | DEFAULT true | 활성 상태 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

### 2.3 `teams` - 팀

각 클럽에 고정 4팀 (RED, BLUE, GREEN, YELLOW).

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 소속 클럽 |
| `name` | text | NOT NULL | 팀명 |
| `color` | text | NOT NULL | 색상 코드 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(club_id, name)`

### 2.4 `members` - 클럽원 (학생)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 소속 클럽 |
| `team_id` | uuid | NULL, REFERENCES teams | 소속 팀 (배정 전 NULL) |
| `name` | text | NOT NULL | 이름 |
| `birthday` | date | NULL | 생년월일 |
| `parent_name` | text | NULL | 학부모 이름 |
| `parent_phone` | text | NULL | 학부모 연락처 |
| `uniform_size` | text | NULL | 단복 사이즈 |
| `enrollment_status` | enrollment_status | NOT NULL, DEFAULT 'pending' | 등록 상태 |
| `registered_by` | uuid | NULL, REFERENCES teachers | 등록한 교사 (교사 직접 등록 시) |
| `approved_by` | uuid | NULL, REFERENCES teachers | 승인한 교사 |
| `approved_at` | timestamptz | NULL | 승인 시각 |
| `active` | boolean | DEFAULT true | 활성 상태 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**학생 등록 시나리오:**
- **학생 자가 가입**: `enrollment_status='pending'`, `team_id=NULL`, `registered_by=NULL` → 교사가 팀 배정 + 승인 → `enrollment_status='active'`
- **교사 직접 등록**: `enrollment_status='active'`, `team_id=배정`, `registered_by=교사ID` → 바로 활성

---

## 3. 룸 테이블 (Rooms = 팀 교실)

룸은 팀과 1:1 연결. 각 팀이 모이는 물리적 공간.

### 3.1 `rooms` - 교실/방

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 소속 클럽 |
| `team_id` | uuid | NOT NULL, REFERENCES teams | 연결된 팀 |
| `name` | text | NOT NULL | 방 이름 |
| `qr_code_data` | text | UNIQUE, NULL | QR 코드 데이터 |
| `active` | boolean | DEFAULT true | 활성 상태 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

### 3.2 `room_sessions` - 방 세션 (주간 모임)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `room_id` | uuid | NOT NULL, REFERENCES rooms | 방 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `started_at` | timestamptz | DEFAULT now() | 시작 |
| `ended_at` | timestamptz | NULL | 종료 |
| `status` | text | DEFAULT 'active' | 상태 |
| `created_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(room_id, training_date)`

### 3.3 `room_teachers` - 방 교사 배정/체크인

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `room_session_id` | uuid | NOT NULL, REFERENCES room_sessions | 세션 |
| `teacher_id` | uuid | NOT NULL, REFERENCES teachers | 교사 |
| `checked_in_at` | timestamptz | DEFAULT now() | 체크인 시각 |

**UNIQUE:** `(room_session_id, teacher_id)`

---

## 4. 출석 테이블 (Attendance)

### 4.1 `teacher_attendance` - 교사 출석

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `teacher_id` | uuid | NOT NULL, REFERENCES teachers | 교사 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `present` | boolean | DEFAULT false | 출석 여부 |
| `note` | text | NULL | 비고 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(teacher_id, training_date)`

### 4.2 `member_attendance` - 클럽원 출석

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `member_id` | uuid | NOT NULL, REFERENCES members | 클럽원 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `present` | boolean | DEFAULT false | 출석 여부 |
| `status` | attendance_status | DEFAULT 'present' | 출석/지각/결석 |
| `absence_reason` | text | NULL | 결석 사유 |
| `note` | text | NULL | 비고 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(member_id, training_date)`

---

## 5. 점수 테이블 (Scoring)

### 핵심 개념
- **핸드북 점수** = 출석 + 핸드북 + 단복 + 암송 합산
- **게임 점수** = 팀 단위 게임 점수
- 시상식: **팀별 핸드북 총점** + **팀별 게임 총점** = 16개 점수

### 5.1 `curriculum_templates` - 커리큘럼 템플릿

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_type` | club_type | NOT NULL, UNIQUE | 클럽 종류 |
| `name` | text | NOT NULL | 템플릿 이름 |
| `scoring_categories` | jsonb | NOT NULL | 카테고리 설정 JSON |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

### 5.2 `weekly_scores` - 주간 개인 점수

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `member_id` | uuid | NOT NULL, REFERENCES members | 클럽원 |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 클럽 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `category` | scoring_category | NOT NULL | 점수 카테고리 |
| `base_points` | integer | NOT NULL, DEFAULT 0 | 기본 점수 |
| `multiplier` | integer | NOT NULL, DEFAULT 1 | 배수 |
| `total_points` | integer | GENERATED (base_points * multiplier) | 총점 (자동) |
| `recorded_by` | uuid | NULL, REFERENCES teachers | 기록 교사 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(member_id, training_date, category)`

### 5.3 `game_score_entries` - 게임 점수 (팀 단위)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `team_id` | uuid | NOT NULL, REFERENCES teams | 팀 |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 클럽 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `points` | integer | NOT NULL | 점수 |
| `description` | text | NULL | 게임 설명 |
| `recorded_by` | uuid | NULL, REFERENCES teachers | 기록 교사 |
| `created_at` | timestamptz | DEFAULT now() | |

### 5.4 `weekly_score_submissions` - 주간 점수 제출/승인 워크플로우

```
교사 입력 중: draft
교사 제출:   submitted
관리자 승인: approved
관리자 반려: rejected → 교사가 수정 후 다시 submitted 가능
```

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_id` | uuid | NOT NULL, REFERENCES clubs | 클럽 |
| `team_id` | uuid | NOT NULL, REFERENCES teams | 팀 |
| `training_date` | date | NOT NULL | 훈련 일자 |
| `status` | submission_status | NOT NULL, DEFAULT 'draft' | 상태 |
| `submitted_by` | uuid | NULL, REFERENCES teachers | 제출 교사 |
| `submitted_at` | timestamptz | NULL | 제출 시각 |
| `approved_by` | uuid | NULL, REFERENCES teachers | 승인 관리자 |
| `approved_at` | timestamptz | NULL | 승인 시각 |
| `rejection_note` | text | NULL | 반려 사유 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(club_id, team_id, training_date)`

---

## 6. 지각/결석 추적

### 6.1 `late_absence_tracking`

3회 지각 = 1회 결석 자동 환산.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `member_id` | uuid | NOT NULL, REFERENCES members | 클럽원 |
| `semester` | text | NOT NULL | 학기 ("2026-1") |
| `late_count` | integer | NOT NULL, DEFAULT 0 | 지각 횟수 |
| `converted_absences` | integer | NOT NULL, DEFAULT 0 | 환산 결석 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(member_id, semester)`

---

## 7. 뱃지 테이블 (Badges)

### 7.1 `badges` - 뱃지 정의

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `name` | text | NOT NULL | 뱃지 이름 |
| `badge_type` | badge_type | NOT NULL | 종류 |
| `description` | text | NULL | 설명 |
| `icon_url` | text | NULL | 아이콘 URL |
| `curriculum_template_id` | uuid | NULL, REFERENCES curriculum_templates | |
| `created_at` | timestamptz | DEFAULT now() | |

### 7.2 `member_badges` - 수여된 뱃지

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `member_id` | uuid | NOT NULL, REFERENCES members | 클럽원 |
| `badge_id` | uuid | NOT NULL, REFERENCES badges | 뱃지 |
| `awarded_by` | uuid | NULL, REFERENCES teachers | 수여 교사 |
| `awarded_date` | date | NOT NULL, DEFAULT CURRENT_DATE | 수여일 |
| `note` | text | NULL | 비고 |
| `created_at` | timestamptz | DEFAULT now() | |

**UNIQUE:** `(member_id, badge_id)`

---

## 8. 훈련 일정

### 8.1 `training_schedules` - 주간 모임 일정 / 캘린더

매주 1회 모임 일정 관리. 캘린더 UI에서 활용.

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `club_id` | uuid | NULL, REFERENCES clubs | 클럽 (NULL=전체) |
| `training_date` | date | NOT NULL | 모임 일자 |
| `is_holiday` | boolean | DEFAULT false | 휴일 여부 |
| `description` | text | NULL | 설명 |
| `created_at` | timestamptz | DEFAULT now() | |
| `updated_at` | timestamptz | DEFAULT now() | |

---

## 9. 테이블 관계도 (ERD)

```
clubs (sparks, tnt)
  ├── teams (4팀: RED, BLUE, GREEN, YELLOW)
  │    ├── rooms (팀 교실, 1:1)
  │    │    └── room_sessions (주간 모임 세션)
  │    │         └── room_teachers (교사 체크인)
  │    ├── members (학생 배정)
  │    ├── game_score_entries (팀 게임 점수)
  │    └── weekly_score_submissions (점수 제출/승인)
  │
  ├── teachers (교사/관리자)
  │    ├── teacher_attendance
  │    ├── weekly_scores (recorded_by)
  │    ├── game_score_entries (recorded_by)
  │    ├── weekly_score_submissions (submitted_by, approved_by)
  │    ├── member_badges (awarded_by)
  │    └── members (registered_by, approved_by)
  │
  ├── members (학생)
  │    ├── member_attendance
  │    ├── weekly_scores
  │    ├── member_badges
  │    └── late_absence_tracking
  │
  ├── weekly_scores (개인 점수)
  ├── game_score_entries (팀 게임 점수)
  ├── weekly_score_submissions (제출/승인 워크플로우)
  └── training_schedules (캘린더/일정)

curriculum_templates ── badges ── member_badges
```

---

## 10. 시상 데이터 흐름

### 16개 점수 구조

```json
{
  "handbook": {
    "sparks": { "RED": 0, "BLUE": 0, "GREEN": 0, "YELLOW": 0 },
    "tnt":    { "RED": 0, "BLUE": 0, "GREEN": 0, "YELLOW": 0 }
  },
  "game": {
    "sparks": { "RED": 0, "BLUE": 0, "GREEN": 0, "YELLOW": 0 },
    "tnt":    { "RED": 0, "BLUE": 0, "GREEN": 0, "YELLOW": 0 }
  }
}
```

### 점수 집계

| 점수 종류 | 소스 테이블 | 집계 방법 |
|-----------|------------|----------|
| 핸드북 점수 | `weekly_scores` | 해당 팀 멤버들의 모든 카테고리 `total_points` 합산 |
| 게임 점수 | `game_score_entries` | 해당 팀의 `points` 합산 |

### 승인 워크플로우

```
1. [교사] 룸에서 학생별 점수 입력 → weekly_scores, game_score_entries
2. [교사] 검토 화면에서 확인 → 수정 가능
3. [교사] "제출" → weekly_score_submissions.status = 'submitted'
4. [관리자] 전체 취합 대시보드 확인
   ├─ 이상 없음 → "승인" → status = 'approved'
   └─ 이상 있음 → "반려" → status = 'rejected' + rejection_note
5. [반려 시] 교사가 바로 수정 → 다시 "제출" → status = 'submitted'
```

---

## 11. RLS 정책 (간소화)

| 테이블 | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| clubs | 모든 사용자 | admin | admin | - |
| teachers | 인증 사용자 | 모든 사용자 (가입) | 본인/admin | - |
| teams | 인증 사용자 | admin | admin | - |
| members | 인증 사용자 | 인증 사용자 | 인증 사용자 | admin |
| rooms | 인증 사용자 | admin | admin | - |
| room_sessions | 인증 사용자 | 인증 사용자 | 인증 사용자 | - |
| room_teachers | 인증 사용자 | 인증 사용자 | - | - |
| teacher_attendance | 인증 사용자 | 인증 사용자 | 인증 사용자 | - |
| member_attendance | 인증 사용자 | 인증 사용자 | 인증 사용자 | - |
| curriculum_templates | 인증 사용자 | admin | admin | - |
| weekly_scores | 인증 사용자 | 인증 사용자 | 인증 사용자 | 인증 사용자 |
| game_score_entries | 인증 사용자 | 인증 사용자 | - | 인증 사용자 |
| weekly_score_submissions | 인증 사용자 | 인증 사용자 | 인증 사용자 | - |
| late_absence_tracking | 인증 사용자 | 인증 사용자 | 인증 사용자 | - |
| badges | 인증 사용자 | admin | admin | - |
| member_badges | 인증 사용자 | 인증 사용자 | - | admin |
| training_schedules | 인증 사용자 | admin | admin | - |

---

## 12. Seed Data (자동 생성)

- 클럽 2개: 스팍스(sparks), 티앤티(tnt)
- 팀 8개: 각 클럽별 RED, BLUE, GREEN, YELLOW
- 룸 8개: 각 팀별 기본 룸 1개
- 커리큘럼 2개: 스팍스/티앤티 기본 점수 카테고리
