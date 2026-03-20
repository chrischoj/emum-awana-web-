import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** 010 제외 나머지 = 초기 비밀번호 */
function getInitialPassword(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.startsWith('010') ? digits.slice(3) : digits;
}

const TEACHERS: { name: string; phone: string; position: string | null; clubType: 'sparks' | 'tnt' | null }[] = [
  // 트렉
  { name: '김영중', phone: '010-7200-7526', position: '설교/방송', clubType: null },
  { name: '조정현', phone: '010-9991-5526', position: '서기팀', clubType: null },
  { name: '김종은', phone: '010-5660-1222', position: '게임디렉터(총괄)', clubType: null },
  { name: '조주원', phone: '010-2394-0507', position: '교육팀', clubType: null },
  { name: '임소연', phone: '010-2987-3725', position: '교육팀', clubType: null },
  { name: '구은정', phone: '010-6234-4148', position: '교육팀', clubType: null },
  { name: '김용진', phone: '010-7334-3725', position: null, clubType: null },
  // 커비스
  { name: '김정숙', phone: '010-4353-7028', position: '감독관', clubType: null },
  { name: '엄혜원', phone: '010-9960-2673', position: '서기 서브', clubType: null },
  // 감독관/GD
  { name: '이제용', phone: '010-9140-6490', position: '총괄', clubType: null },
  // 스팍스
  { name: '김정희', phone: '010-7587-7338', position: '팀장', clubType: 'sparks' },
  { name: '안혜민', phone: '010-9562-4789', position: '교사', clubType: 'sparks' },
  { name: '이동준', phone: '010-4595-3073', position: '교사', clubType: 'sparks' },
  { name: '채의수', phone: '010-3324-0522', position: '교사', clubType: 'sparks' },
  // 티앤티
  { name: '김현주', phone: '010-9788-0907', position: '팀장', clubType: 'tnt' },
  { name: '원다연', phone: '010-3211-3359', position: '교사', clubType: 'tnt' },
  { name: '박지혜', phone: '010-7709-4388', position: '교사', clubType: 'tnt' },
  { name: '이지영', phone: '010-9016-4862', position: '교사', clubType: 'tnt' },
  { name: '장찬미', phone: '010-9611-8774', position: '교사', clubType: 'tnt' },
  { name: '김은주', phone: '010-2024-0047', position: '교사', clubType: 'tnt' },
  { name: '김민영', phone: '010-2052-1022', position: '교사', clubType: 'tnt' },
  { name: '함고운', phone: '010-720-0901', position: '교사', clubType: 'tnt' },
  // 서기팀
  { name: '천나영', phone: '010-6664-1881', position: '서기팀장', clubType: null },
  { name: '김경란', phone: '010-5761-1070', position: '서기', clubType: null },
  { name: '김택훈', phone: '010-8799-3618', position: '회계/물품', clubType: null },
];

async function main() {
  console.log('=== 교사 계정 일괄 생성 ===\n');

  // 1. 클럽 ID 조회
  const { data: clubs } = await supabase.from('clubs').select('id, type');
  const sparksClubId = clubs?.find(c => c.type === 'sparks')?.id || null;
  const tntClubId = clubs?.find(c => c.type === 'tnt')?.id || null;
  console.log(`스팍스 클럽 ID: ${sparksClubId}`);
  console.log(`티앤티 클럽 ID: ${tntClubId}\n`);

  let success = 0;
  let failed = 0;
  const seen = new Set<string>();

  for (const t of TEACHERS) {
    const phoneDigits = t.phone.replace(/[^0-9]/g, '');

    // 전화번호 중복 체크
    if (seen.has(phoneDigits)) {
      console.log(`⏭️  ${t.name} (${t.phone}) - 중복 전화번호, 건너뜀`);
      continue;
    }
    seen.add(phoneDigits);

    const email = `${phoneDigits}@awana.local`;
    const password = getInitialPassword(t.phone);
    const clubId = t.clubType === 'sparks' ? sparksClubId : t.clubType === 'tnt' ? tntClubId : null;

    try {
      // Auth 계정 생성 (service role → email 자동 확인)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'teacher' },
      });

      if (authError) throw authError;

      // teachers 테이블 INSERT
      const { error: insertError } = await supabase.from('teachers').insert({
        user_id: authData.user.id,
        name: t.name,
        phone: t.phone,
        club_id: clubId,
        position: t.position,
        role: 'teacher',
      });

      if (insertError) throw insertError;

      console.log(`✅ ${t.name} (${t.phone}) → ID: ${phoneDigits} / PW: ${password}`);
      success++;
    } catch (error: any) {
      console.log(`❌ ${t.name} (${t.phone}) → ${error.message}`);
      failed++;
    }
  }

  console.log(`\n=== 완료: 성공 ${success}건, 실패 ${failed}건 ===`);
}

main().catch(console.error);
