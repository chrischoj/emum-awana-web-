/** 전화번호 입력값을 010-1234-5678 형태로 자동 포맷 */
export function formatPhone(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 전화번호에서 초기 비밀번호 추출 (010 제외 나머지) */
export function getInitialPassword(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.startsWith('010') ? digits.slice(3) : digits;
}
