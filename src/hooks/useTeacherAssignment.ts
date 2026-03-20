// Context 기반으로 전환: TeacherLayout에서 Provider가 한 번만 데이터를 로드하므로
// 탭 전환 시 반복 API 호출이 발생하지 않음
export { useTeacherAssignment } from '../contexts/TeacherAssignmentContext';
