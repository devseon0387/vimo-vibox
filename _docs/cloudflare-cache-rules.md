# Cloudflare Cache Rules 설정 가이드 (Vibox Phase 0)

**목적**: Vibox 응답 중 공개 가능한 것들을 CF 엣지에 캐시해서 터널 트래픽 감소.

**위치**: Cloudflare 대시보드 → `vibox.cloud` 선택 → 좌측 메뉴 **Caching** → **Cache Rules** → **Create rule**

---

## Rule 1: 공유 링크 썸네일 (장기 캐시)

**이름**: `Share thumbnails`

**Incoming requests match (If)**:
- Field: `URI Path`
- Operator: `wildcard`
- Value: `/api/s/*/thumb*`

**Then (Cache eligibility)**:
- `Eligible for cache`

**Edge TTL**:
- Override origin: **On**
- Duration: **1 week** (604800)

**Browser TTL**:
- Override origin: **Off** (서버 헤더 `public, max-age=604800` 따름)

---

## Rule 2: 내부 썸네일 (공개화된 이후)

**이름**: `Internal thumbnails`

**Incoming requests match (If)**:
- Field: `URI Path`
- Operator: `wildcard`
- Value: `/api/thumb*`

**Then (Cache eligibility)**:
- `Eligible for cache`

**Edge TTL**:
- Override origin: **On**
- Duration: **1 week**

**⚠️ 주의**: 내부 썸네일은 세션 쿠키 있는 요청. CF는 기본적으로 쿠키 있는 요청 캐시 안 함. 아래 "쿠키 무시" 옵션 필요.

**Cache Key** 섹션:
- `Cache by device type`: Off
- `Ignore query strings sorts`: On
- `Cookie`: 비워둠 (쿠키 무시)
- 또는 별도 서브도메인(`static.vibox.cloud`)으로 분리 운영 권장

**보조 가이드**: 내부 썸네일은 인증이 필요하므로 Rule 2 는 기본 미활성화하고, 나중에 인증 구조 정리 후 적용 추천. **지금은 Rule 1 (공유 썸네일)만 적용**.

---

## Rule 3: 공유 링크 영상 본체 (중기 캐시)

**이름**: `Share videos`

**Incoming requests match (If)**:
- Field: `URI Full`
- Operator: `matches regex`
- Value: `^/api/s/[A-Za-z0-9_-]+($|\?)`

**Then**:
- `Eligible for cache`

**Edge TTL**:
- Override origin: **On**
- Duration: **1 hour** (3600)

**⚠️ 주의사항**:
- 현재 영상 대부분 500MB~3GB → **Free 플랜 512MB 한도 초과 파일은 캐시 안 됨**
- 썸네일·짧은 영상(미리보기 등) 만 캐시 효과 있음
- 본격적인 영상 캐시는 **Phase 1 (HLS 세그먼트)** 이후 가능
- 그래도 규칙은 미리 세팅: Phase 1 에 HLS 가 도입되면 자동으로 효과 발동

---

## Rule 4: 로고·정적 이미지 (최장기 캐시)

**이름**: `Static images`

**Incoming requests match (If)**:
- Field: `URI Path`
- Operator: `wildcard`
- Value: `/logo.png` OR `/icon.png` OR `/apple-icon.png` OR `/favicon.ico`

**또는 한 번에**:
- Field: `URI Path`
- Operator: `matches regex`
- Value: `\.(png|jpg|jpeg|svg|ico|webp)$`

**Then**:
- `Eligible for cache`

**Edge TTL**:
- Override origin: **On**
- Duration: **30 days** (2592000)

---

## Rule 5: HLS 세그먼트 (Phase 1, 핵심 캐시)

**이름**: `HLS streaming`

**Incoming requests match (If)**:
- Field: `URI Path`
- Operator: `wildcard`
- Value: `/api/stream/*`

**Then (Cache eligibility)**:
- `Eligible for cache`

**Edge TTL**:
- Override origin: **On**
- Duration: **1 month** (2592000)

**Browser TTL**:
- Override origin: **Off** (서버 헤더 따름. `.m3u8` 5분, `.ts` 30일)

**Cache Key** 섹션:
- `Ignore query strings sorts`: On
- `Cookie`: 비워둠 (HLS 응답은 인증 후 동일 fingerprint 면 같은 콘텐츠 — 쿠키 무시 안전)
- `Custom headers`: 비워둠

**왜 핵심**:
- 영상은 fingerprint 폴더 안의 5~10MB 세그먼트로 쪼개져 있음 → Free 512MB 한도 안전
- fingerprint 가 콘텐츠 해시라 immutable 보장 → 30일 캐시 안전
- 같은 영상 두 번째 시청부터 모두 CF HIT → 터널 트래픽 0

**⚠️ 주의**:
- `?token=...` 쿼리 파라미터로 공유 링크 인증. 위 `Ignore query strings sorts` 켜면 토큰별로 별도 캐시 키 안 생기고 path-only 로 캐시. 대신 첫 요청 시 인증 통과한 후 후속 요청은 모두 같은 캐시 응답 → 토큰 만료/회수 후에도 캐시된 응답 반환 가능
- 보안 트레이드: HLS 콘텐츠는 **fingerprint 알아야 접근 가능** (16자 hex), URL 추측 어려움. 토큰 만료 후 캐시 무효화는 Phase 2 과제로
- 매니페스트는 5분 TTL 이라 토큰 회수 영향 작음

---

## Rule 6: 민감 API 는 절대 캐시 금지

**이름**: `Never cache auth/admin/comments`

**Incoming requests match (If)**:
- Field: `URI Path`
- Operator: `starts with`
- Value: `/api/auth/` OR `/api/admin/` OR `/api/comments` OR `/api/files` OR `/api/my/` OR `/api/library/`

**한 번에 (regex)**:
- Field: `URI Path`
- Operator: `matches regex`
- Value: `^/api/(auth|admin|comments|files|my|library|upload)`

**Then**:
- `Bypass cache`

**목적**: 세션·권한 의존 응답이 실수로 캐시되는 것 방지. 기본적으로 쿠키 있으면 CF 안 캐시하지만 안전장치.

---

## 설정 후 검증

### A) 응답 헤더 확인

```bash
# 공유 링크 썸네일 (캐시되어야 함)
curl -I "https://vibox.cloud/api/s/{TOKEN}/thumb?p=/test.mp4"
# 응답 헤더:
#   cache-control: public, max-age=604800
#   cf-cache-status: HIT   ← 두 번째 요청부터 HIT 뜨면 성공
```

**`cf-cache-status` 상태값 의미:**
- `HIT`: 캐시에서 응답 ✅ (성공)
- `MISS`: 캐시 없어 오리진에서 가져옴 (첫 요청 정상)
- `EXPIRED`: 만료됨, 갱신 중
- `BYPASS`: 캐시 우회 (Rule 5 해당)
- `DYNAMIC`: 캐시 제외 (쿠키·인증 등)
- `REVALIDATED`: If-None-Match 검증 후 재사용

### B) 같은 URL 두 번 요청해보기

```bash
curl -I https://vibox.cloud/logo.png  # 첫 요청: MISS
curl -I https://vibox.cloud/logo.png  # 두 번째: HIT
```

### C) Cloudflare Analytics 로 확인

대시보드 → Analytics → **Caching**
- Cache Hit Ratio 지표
- 시간별 캐시 vs 오리진 그래프
- 목표: 정적 자산·썸네일 **80% 이상**

---

## 문제 해결

### "왜 캐시 안 되는 거지?"

1. **응답에 `set-cookie` 헤더 있음** → CF는 기본적으로 쿠키 설정 응답 캐시 안 함
2. **응답 크기 > 512MB** → Free 한도 초과
3. **Cache-Control: `private`** → `public`으로 변경 필요
4. **쿼리 파라미터가 캐시 키에 포함** → 동일 URL도 `?a=1`, `?a=2` 다르게 캐시
5. **`Vary: Cookie` 헤더** → 쿠키별 캐시 분리 = 사실상 캐시 안 됨

### 캐시 수동 무효화 (새 버전 배포 시)

대시보드 → Caching → **Configuration** → **Purge Cache**:
- `Purge Everything`: 전체 (주의!)
- `Custom Purge`: URL 입력해 선택 삭제

---

## 다음 단계

Phase 0 완료 후 **Phase 1 (HLS 세그먼트 인코딩)** 로 진행하면 영상 본편도 캐시 대상이 됨.

관련 문서:
- `~/SEON-OP/seon/웹 및 앱 개발/Vibox/Cloudflare Free 플랜 최대 활용 가이드 — 스트리밍 중심.md`
- memory: `reference_vibox_cloudflare_streaming.md`
