import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getActiveAssignments } from '../services/assignmentService';
import { checkInTeacherToRooms } from '../services/checkInService';
import { getToday } from '../lib/utils';

const CACHE_KEY = 'awana_auto_checkin';

interface AutoCheckInCache {
  teacherId: string;
  date: string;
}

function hasCheckedInToday(teacherId: string): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const cache: AutoCheckInCache = JSON.parse(raw);
    return cache.teacherId === teacherId && cache.date === getToday();
  } catch {
    return false;
  }
}

function markCheckedIn(teacherId: string): void {
  const cache: AutoCheckInCache = { teacherId, date: getToday() };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/**
 * 로그인 시 배정된 모든 교실에 자동 체크인 (하루 1회)
 * - 클럽 무관하게 전체 배정 교실 대상
 * - 배정 없는 교사는 스킵 (QR 스캔 방식 유지)
 * - 실패 시 silent fail (console.warn만)
 * - React StrictMode 이중 호출 방지 (executedRef)
 */
export function useAutoCheckIn(): void {
  const { teacher } = useAuth();
  const executedRef = useRef(false);

  useEffect(() => {
    if (!teacher || executedRef.current) return;
    if (hasCheckedInToday(teacher.id)) return;

    executedRef.current = true;

    getActiveAssignments(teacher.id)
      .then((assignments) => {
        const roomIds = [...new Set(assignments.map(a => a.room_id))];
        if (roomIds.length === 0) {
          executedRef.current = false;
          return; // 배정 없는 교사는 스킵
        }
        return checkInTeacherToRooms(roomIds, teacher.id).then(() => {
          markCheckedIn(teacher.id);
          console.log(`[AutoCheckIn] ${roomIds.length}개 교실 자동 체크인 완료`);
        });
      })
      .catch((err) => {
        console.warn('[AutoCheckIn] 자동 체크인 실패:', err);
        executedRef.current = false;
      });
  }, [teacher]);
}
