// vibox SQLite 복사본 → Postgres 데이터 이전. baseon_admin로 접속(FK 우회).
// env: ADMIN_URL(=postgres://baseon_admin:..@host:5432/vibox), SQLITE_COPY(=/tmp/vibox-copy.db)
import Database from 'better-sqlite3'
import postgres from 'postgres'

const sdb = new Database(process.env.SQLITE_COPY || '/tmp/vibox-copy.db', { readonly: true })
const sql = postgres(process.env.ADMIN_URL, { prepare: false, max: 1 })

// FK 안전 순서(어차피 replica role로 FK 우회하지만 보기 좋게)
const TABLES = [
  'users', 'clients', 'file_uploads', 'share_links', 'comments', 'comment_moderations',
  'trash_items', 'scan_history', 'traffic_log', 'encoding_jobs', 'hls_assets',
  'client_videos', 'client_share_tokens', 'api_tokens', 'share_views',
  'ai_review_feedback', 'push_subscriptions', 'note_index', 'note_versions',
]

await sql`SET session_replication_role = replica` // FK/트리거 우회(superuser)
const report = []
for (const t of TABLES) {
  const cols = await sql`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=${t}`
  if (!cols.length) { report.push(`${t}: PG테이블 없음 SKIP`); continue }
  const tsCols = new Set(cols.filter((c) => String(c.data_type).includes('timestamp')).map((c) => c.column_name))
  const boolCols = new Set(cols.filter((c) => c.data_type === 'boolean').map((c) => c.column_name))
  const pgCols = new Set(cols.map((c) => c.column_name))
  let rows
  try { rows = sdb.prepare(`SELECT * FROM "${t}"`).all() } catch (e) { report.push(`${t}: SQLite 없음 (${e.message})`); continue }
  if (rows.length) {
    const conv = rows.map((r) => {
      const o = {}
      for (const [k, v] of Object.entries(r)) {
        if (!pgCols.has(k)) continue
        o[k] = v == null ? null : tsCols.has(k) ? new Date(Number(v)) : boolCols.has(k) ? Boolean(v) : v
      }
      return o
    })
    const CH = 500
    for (let i = 0; i < conv.length; i += CH) await sql`insert into ${sql(t)} ${sql(conv.slice(i, i + CH))}`
  }
  const [{ n }] = await sql`select count(*)::int as n from ${sql(t)}`
  report.push(`${t}: sqlite=${rows.length} → pg=${n} ${n === rows.length ? 'OK' : 'MISMATCH'}`)
}
await sql`SET session_replication_role = DEFAULT`
console.log(report.join('\n'))
const bad = report.filter((r) => r.includes('MISMATCH'))
console.log(bad.length ? `\n⚠️ 불일치 ${bad.length}건` : '\n✅ 전 테이블 정합성 OK')
await sql.end()
