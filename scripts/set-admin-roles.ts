import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// admin 대상 키워드: 조정관/감독관/서기/팀장/회계/총괄/설교/게임디렉터
const adminKeywords = ['조정관', '감독관', '서기', '팀장', '회계', '총괄', '설교', '게임디렉터'];

async function main() {
  console.log('=== 교사 admin 권한 부여 ===\n');

  const { data: teachers } = await supabase.from('teachers').select('id, name, position, role');
  if (!teachers) { console.log('교사 목록 조회 실패'); return; }

  let updated = 0;
  for (const t of teachers) {
    const isAdmin = t.name === '김종은' ||
      (t.position && adminKeywords.some(k => t.position.includes(k)));

    if (isAdmin && t.role !== 'admin') {
      const { error } = await supabase.from('teachers').update({ role: 'admin' }).eq('id', t.id);
      if (error) {
        console.log(`❌ ${t.name} (${t.position}) → ${error.message}`);
      } else {
        console.log(`✅ ${t.name} (${t.position}) → admin`);
        updated++;
      }
    }
  }

  console.log(`\n=== 완료: ${updated}명 admin 권한 부여 ===`);
}

main().catch(console.error);
