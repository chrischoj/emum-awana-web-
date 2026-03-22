import type { CurlDirection, CurlGeometry } from '../types';

/**
 * 컬 효과 기하학 계산.
 *
 * curlProgress: 0 = 페이지 완전히 펼쳐짐, 1 = 완전히 넘어감
 * direction: 'next' = 오른쪽에서 왼쪽으로 컬, 'prev' = 왼쪽에서 오른쪽으로 컬
 *
 * 반환값:
 * - clipPath: 현재 페이지를 자를 clip-path polygon
 * - foldX: 접힘선의 X 위치 (0~100% 기준)
 * - curlBackClip: 컬 뒷면의 clip-path
 * - curlBackTransform: 컬 뒷면의 transform
 * - shadowGradient: 접힘선 그림자 gradient
 */
export function computeCurlGeometry(progress: number, direction: CurlDirection): CurlGeometry {
  // clamp
  const p = Math.max(0, Math.min(1, progress));

  if (direction === 'next') {
    // 오른쪽 가장자리에서 왼쪽으로 컬
    // foldX: 100% -> 0% (progress 0->1)
    const foldX = 100 - p * 100;
    // 약간의 대각선 효과: 상단은 foldX, 하단은 foldX + skew
    const skew = Math.sin(p * Math.PI) * 8; // 최대 8% 대각선
    const topX = foldX;
    const botX = Math.min(100, foldX + skew);

    // 현재 페이지: 접힘선 왼쪽만 보임
    const clipPath = `polygon(0% 0%, ${topX}% 0%, ${botX}% 100%, 0% 100%)`;

    // 컬 뒷면: 접힘선에서 오른쪽으로 컬 너비만큼
    const curlWidth = Math.min(p * 100, 30); // 최대 30% 너비
    const curlRightTop = Math.min(100, topX + curlWidth);
    const curlRightBot = Math.min(100, botX + curlWidth);
    const curlBackClip = `polygon(${topX}% 0%, ${curlRightTop}% 0%, ${curlRightBot}% 100%, ${botX}% 100%)`;

    // 컬 뒷면의 scaleX(-1) 효과를 위한 transform-origin
    const curlBackTransform = `scaleX(-1)`;
    const curlBackOrigin = `${topX}% 50%`;

    // 그림자: 접힘선 위치에 세로 그라데이션
    const shadowGradient = `linear-gradient(to right,
      transparent ${Math.max(0, foldX - 3)}%,
      rgba(0,0,0,0.15) ${foldX}%,
      rgba(0,0,0,0.25) ${Math.min(100, foldX + 1)}%,
      rgba(0,0,0,0.1) ${Math.min(100, foldX + 4)}%,
      transparent ${Math.min(100, foldX + 8)}%)`;

    return { clipPath, foldX, curlBackClip, curlBackTransform, curlBackOrigin, shadowGradient, curlWidth };
  } else {
    // 왼쪽 가장자리에서 오른쪽으로 컬
    const foldX = p * 100;
    const skew = Math.sin(p * Math.PI) * 8;
    const topX = foldX;
    const botX = Math.max(0, foldX - skew);

    const clipPath = `polygon(${topX}% 0%, 100% 0%, 100% 100%, ${botX}% 100%)`;

    const curlWidth = Math.min(p * 100, 30);
    const curlLeftTop = Math.max(0, topX - curlWidth);
    const curlLeftBot = Math.max(0, botX - curlWidth);
    const curlBackClip = `polygon(${curlLeftTop}% 0%, ${topX}% 0%, ${botX}% 100%, ${curlLeftBot}% 100%)`;

    const curlBackTransform = `scaleX(-1)`;
    const curlBackOrigin = `${topX}% 50%`;

    const shadowGradient = `linear-gradient(to left,
      transparent ${Math.max(0, 100 - foldX - 3)}%,
      rgba(0,0,0,0.15) ${100 - foldX}%,
      rgba(0,0,0,0.25) ${Math.min(100, 100 - foldX + 1)}%,
      rgba(0,0,0,0.1) ${Math.min(100, 100 - foldX + 4)}%,
      transparent ${Math.min(100, 100 - foldX + 8)}%)`;

    return { clipPath, foldX, curlBackClip, curlBackTransform, curlBackOrigin, shadowGradient, curlWidth };
  }
}
