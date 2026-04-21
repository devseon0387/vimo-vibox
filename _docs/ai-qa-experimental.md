# AI QA (영상 품질 자동 검수) — 실험 기록

**상태**: 실험 단계 보류 (2026-04-20). 프로토타입 작동 확인, 실사용은 학습/튜닝 이후.

## 왜 시도했나

영상 편집 품질 중 **사람 눈으로 놓치기 쉬운 기술적 결함**을 자동 탐지:
- 0.1초 블랙 프레임 (편집 실수)
- 1~2 프레임 튐/플래시
- 긴 영상에서 자막 오타

## 구현 위치

```
scripts/_experimental/ai-qa.sh
```

## 기술 파이프라인

```
영상.mp4
  ├─ [1] ffmpeg blackdetect         → 블랙 구간 리스트
  ├─ [2] ffmpeg scdet + python      → 근접 씬체인지 쌍 (튀는 프레임)
  └─ [3] ffmpeg 프레임 샘플링       → Claude CLI (@frame.jpg)
                                      → 자막 OCR + 오타 검수 JSON
        → 전체 결과 JSON 병합 → /tmp/qa-*.json
```

## 핵심 ffmpeg 커맨드

### 블랙 프레임 (결정론적, AI 불필요)
```bash
ffmpeg -i video.mp4 -vf "blackdetect=d=0.03:pic_th=0.95" -f null - 2>&1 |
  grep -oE "black_start:[0-9.]+ black_end:[0-9.]+ black_duration:[0-9.]+"
```
- `d=0.03` → 30ms 이상 블랙만 감지
- `pic_th=0.95` → 95% 픽셀이 블랙일 때

### 튀는 프레임 (씬체인지 근접 쌍)
```bash
ffmpeg -i video.mp4 -vf "select=gt(scene\,0.3),showinfo" -f null - 2>&1 |
  grep -oE "pts_time:[0-9.]+"
```
- python으로 타임스탬프 리스트 추출 → 인접 간격 < 150ms인 쌍을 "글리치"로 판정
- 30fps 기준 67ms = 2프레임, 100ms = 3프레임

### 자막 프레임 샘플링
```bash
# 영상 길이에 맞춰 5~22초 간격으로 추출 (최대 20장)
for t in 0 5 10 ...; do
  ffmpeg -ss $t -i video.mp4 -frames:v 1 -vf "scale=640:-1" "t${t}s.jpg"
done
```

## Claude CLI 호출

```bash
env -u CLAUDECODE claude -p "프롬프트... @t5s.jpg @t10s.jpg ..." --output-format text
```

- `CLAUDECODE` env 제거 필수 (중첩 세션 방지)
- `@파일경로` syntax로 이미지 attachment
- 한 번에 ~20장까지 안정적으로 처리
- 프롬프트에 "JSON 배열만 출력" 명시 → 파싱 용이

프롬프트 핵심:
```
한국어 자막 QA 검수.
파일명 형식: t{초}s.jpg
JSON 배열로만 출력.
자막 없는 프레임 · 이슈 없는 프레임은 제외.
```

## 실측 성능 (맥북 M-series)

| 단계 | 시간 | 도구 |
|---|---|---|
| 블랙 감지 (7분 영상) | ~5초 | ffmpeg |
| 씬체인지 감지 | ~10초 | ffmpeg |
| 프레임 20장 추출 | ~3초 | ffmpeg |
| Claude 자막 검수 | ~15초 | Claude CLI |
| **합계** | **~30초** | |

## 실제 테스트 결과 (`#18_프리2d비2트.mp4`, 7분)

블랙 프레임 7건 중 **3건 의심 글리치** (0:20, 1:23, 2:00 각 0.10초)
튀는 프레임 5건 (3:30, 3:39, 5:20, 5:37 · 각 2~3프레임)
자막 이슈 0건 (자막은 깔끔)

**ffmpeg 기반 결정론적 탐지는 즉시 신뢰 가능** — AI 할루시네이션 위험 없음.
**자막 AI 검수는 Claude가 한국어를 잘 읽음** 확인됨.

## 왜 보류했나

1. **자막 스타일 학습 필요** — Claude가 자막과 UI 오버레이 자막을 구분해야 함. 영상마다 자막 디자인이 달라서 샘플 축적 필요
2. **False positive 감지 튜닝 필요** — "튀는 프레임"이 의도한 플래시 효과인지 실수인지 구분 어려움. 현재는 둘 다 걸림
3. **실사용 시 정확도 기준 미정** — 팀이 어느 수준까지 검수 맡길지 합의 필요

## 재개 시 체크리스트

- [ ] 여러 영상에 돌려 false positive 비율 측정
- [ ] 의도적 블랙/플래시 vs 실수 구분 로직 (컨텍스트 앞뒤 프레임 확인)
- [ ] 자막 있는 프레임만 선별 추출 (현재는 전체 샘플링)
- [ ] Vibox 통합: "AI QA" 버튼 → 결과를 comments 테이블에 AI 작성자로 INSERT
- [ ] AI 댓글 UI 구분 (🤖 아이콘, 회색 보더)
- [ ] 아이맥에 Claude Code CLI 설치 + 로그인 (프로덕션 실행 시)

## 관련 파일

- `scripts/_experimental/ai-qa.sh` — 파이프라인 스크립트
- `/tmp/qa-*.json` — 임시 결과 (실행 후 생성)
