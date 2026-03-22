import type { ReflowBlock } from '../types';

/** 라인 배열을 구분자 배열로 합침 (구분자: ' ' 또는 '\n') */
function joinWithSeps(lines: string[], seps: string[]): string {
  let result = lines[0] ?? '';
  for (let i = 1; i < lines.length; i++) {
    result += (seps[i - 1] ?? ' ') + lines[i];
  }
  return result;
}

/**
 * 단일 PDF 페이지에서 리플로우용 텍스트 블록을 추출한다.
 *
 * PDF 텍스트 레이어를 파싱하여 라인 그룹핑, 문단 분리, 헤딩 감지를 수행한다.
 */
export async function extractPageReflow(pdfDoc: any, pageNum: number): Promise<ReflowBlock[]> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;
  const textContent = await page.getTextContent();
  const items = textContent.items.filter((item: any) => item.str && item.str.trim().length > 0);

  if (items.length === 0) return [];

  // 정규화: PDF 좌표(하->상)를 화면 좌표(상->하)로 변환
  const normalized = items.map((item: any) => {
    const fontSize =
      Math.abs(item.transform[3]) ||
      Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2) ||
      12;
    return {
      str: item.str as string,
      x: item.transform[4] as number,
      y: pageHeight - item.transform[5], // top-down
      width: (item.width || 0) as number,
      fontSize,
    };
  });

  // 위->아래, 왼->오 정렬
  normalized.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  // 라인 그룹핑 (같은 Y +/- fontSize*0.5)
  const lines: (typeof normalized)[] = [];
  let curLine = [normalized[0]];

  for (let i = 1; i < normalized.length; i++) {
    const item = normalized[i];
    const last = curLine[curLine.length - 1];
    if (Math.abs(item.y - last.y) > item.fontSize * 0.5) {
      lines.push([...curLine]);
      curLine = [item];
    } else {
      curLine.push(item);
    }
  }
  if (curLine.length > 0) lines.push(curLine);

  // 라인 텍스트 조합 (스마트 스페이싱)
  const lineData = lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let text = '';
      for (let i = 0; i < line.length; i++) {
        if (i > 0) {
          const gap = line[i].x - (line[i - 1].x + line[i - 1].width);
          const avgChar = line[i - 1].fontSize * 0.5;
          if (gap > avgChar) text += ' ';
        }
        text += line[i].str;
      }
      return { text: text.trim(), fontSize: line[0].fontSize, y: line[0].y };
    })
    .filter((l) => l.text.length > 0);

  if (lineData.length === 0) return [];

  // 중앙값 폰트 크기 (헤딩 판별용)
  const sizes = lineData.map((l) => l.fontSize).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];

  // 라인 -> 문단 그룹핑
  // 줄 간격 기준: >2.0x = 새 문단, 1.3~2.0x = 개행(\n), <1.3x = 공백(같은 줄 이어 붙임)
  const blocks: ReflowBlock[] = [];
  let paraLines: string[] = [];
  let paraSeps: string[] = []; // 각 라인 사이 구분자 (' ' 또는 '\n')
  let paraFontSize = lineData[0].fontSize;

  for (let i = 0; i < lineData.length; i++) {
    const line = lineData[i];
    const prev = lineData[i - 1];

    const isNewPara =
      prev &&
      ((line.y - prev.y) > prev.fontSize * 2.0 || // 큰 줄간격
        Math.abs(line.fontSize - paraFontSize) > 2); // 폰트 크기 변화

    if (isNewPara && paraLines.length > 0) {
      const text = joinWithSeps(paraLines, paraSeps);
      const isHeading = paraFontSize > medianSize * 1.2;
      blocks.push({
        type: isHeading ? 'heading' : 'paragraph',
        text,
        level: isHeading ? (paraFontSize > medianSize * 1.5 ? 1 : 2) : undefined,
        pageNum,
      });
      paraLines = [];
      paraSeps = [];
    }

    if (paraLines.length > 0 && prev) {
      // 중간 줄간격(1.3~2.0x) → 개행, 그 이하 → 공백
      const gap = line.y - prev.y;
      paraSeps.push(gap > prev.fontSize * 1.3 ? '\n' : ' ');
    }

    paraLines.push(line.text);
    if (paraLines.length === 1) paraFontSize = line.fontSize;
  }

  if (paraLines.length > 0) {
    const text = joinWithSeps(paraLines, paraSeps);
    const isHeading = paraFontSize > medianSize * 1.2;
    blocks.push({
      type: isHeading ? 'heading' : 'paragraph',
      text,
      level: isHeading ? (paraFontSize > medianSize * 1.5 ? 1 : 2) : undefined,
      pageNum,
    });
  }

  return blocks;
}

/**
 * 모든 페이지에서 리플로우 블록을 추출한다 (일괄 추출).
 */
export async function extractAllPagesReflow(pdfDoc: any, numPages: number): Promise<ReflowBlock[]> {
  const blocks: ReflowBlock[] = [];
  for (let i = 1; i <= numPages; i++) {
    if (i > 1) blocks.push({ type: 'divider', text: '', pageNum: i });
    const pageBlocks = await extractPageReflow(pdfDoc, i);
    blocks.push(...pageBlocks);
  }
  return blocks;
}
