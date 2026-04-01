/**
 * birthday(ISO date string) → 만 나이 계산
 */
export function getAge(birthday: string): number {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * birthday(ISO date string) → 한국식 학년 계산
 * 한국은 3월 시작이므로, 해당 학년도 기준으로 계산
 * 초등 1~6학년 반환, 미취학이면 null
 */
export function getSchoolGrade(birthday: string): number | null {
  const birth = new Date(birthday);
  const today = new Date();

  // 학년도는 3월 시작: 현재 월이 1~2월이면 전년도 학년도
  const currentYear = today.getMonth() < 2 ? today.getFullYear() - 1 : today.getFullYear();

  // 입학 연도: 만 6세가 되는 해 (생일 기준 연도 + 7, 한국식)
  // 한국: 해당 연도에 만 6세가 되는 아이가 3월에 입학
  const birthYear = birth.getFullYear();
  // 빠른 생일(1~2월생)은 전년도 학년에 포함
  const adjustedBirthYear = birth.getMonth() < 2 ? birthYear - 1 : birthYear;
  const entryYear = adjustedBirthYear + 7; // 초등 입학 연도

  const grade = currentYear - entryYear + 1;

  if (grade < 1) return null; // 미취학
  if (grade > 6) return grade; // 중학생 이상도 표시 (7 = 중1 등)
  return grade;
}

/**
 * 학년을 표시 문자열로 변환
 */
export function gradeLabel(grade: number | null): string {
  if (grade === null) return '미취학';
  if (grade <= 6) return `${grade}학년`;
  if (grade <= 9) return `중${grade - 6}`;
  return `고${grade - 9}`;
}

/**
 * birthday(ISO date string) → 한국 나이 (세는나이) 계산
 * 현재연도 - 출생연도 + 1
 */
export function getKoreanAge(birthday: string): number {
  const birthYear = new Date(birthday).getFullYear();
  return new Date().getFullYear() - birthYear + 1;
}

/**
 * 날짜를 한국어 형식으로 포맷 (예: "4/4(토)")
 */
export function formatDateKorean(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = days[date.getDay()];
  return `${month}/${day}(${dayOfWeek})`;
}

/**
 * D-day 계산 (오늘 기준)
 */
export function getDday(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
