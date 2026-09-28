# VPS 배포·운영 가이드

이 문서는 Ubuntu 24.04 VPS 1대에서 Docker Compose로 web, worker, Redis, Caddy를 운영하는 절차다. 권장 사양은 4 vCPU, RAM 8GB 이상이다. 명령은 `/srv/pdf-score-mxl`에 저장소를 둔다는 전제로 작성했다.

Vercel 단독 배포는 지원하지 않는다. 이 서비스에는 Redis 큐, 상주 Audiveris 워커, web/worker가 공유하는 `/data`, 최대 20분 동안 실행되는 변환 작업이 모두 필요하다. Caddy만 호스트의 80/443번 포트를 공개하고 web 3000번과 Redis 6379번은 Docker 네트워크 안에 둔다.

> 이 문서는 배포 런북이다. 문서를 작성하거나 로컬 테스트를 통과한 것만으로 실서버 배포가 검증되지는 않는다. 공개 배포 완료는 §7의 인터넷 전체 흐름을 실제로 통과했을 때만 판정한다.

## 1. V2 운영 구조

- `docker-compose.yml`: 공통 서비스와 내부 네트워크. web/Redis의 호스트 포트는 없다.
- `docker-compose.override.yml`: 로컬 개발 전용. `docker compose up`처럼 `-f` 없이 실행할 때 자동으로 합쳐져 web `3000`, localhost Redis `6379`를 연다.
- `docker-compose.prod.yml`: production web 이미지, Caddy, 재시작 정책. 운영에서는 두 파일을 `-f`로 명시하므로 개발 override가 합쳐지지 않는다.
- production Next standalone은 이미지의 `HOSTNAME=0.0.0.0`으로 컨테이너 네트워크에 바인딩한다.
- `GET /api/health`: 외부 의존성을 보지 않는 web 프로세스 생존 확인용이다.
- `GET /api/status`: Redis, 연결된 워커 수, 대기·실행 작업 수, `/data` 여유 공간, Audiveris 버전을 각각 1초 제한으로 확인한다. 일부 조회가 실패해도 HTTP 200과 부분 결과를 반환하므로 **상태 코드만 보지 말고 JSON 필드도 확인**한다.
- worker는 Redis `PING` 성공 후 `/tmp/worker-heartbeat`를 30초마다 갱신한다. 90초보다 오래된 파일은 healthcheck 실패이며, Compose의 재시도 횟수까지 지난 뒤 컨테이너가 `unhealthy`가 된다. 운영 `.env`에는 `HEARTBEAT_DISABLED=1`을 넣지 않는다.
- 변환 작업 파일은 호스트의 `./data`를 web/worker의 `/data`로 함께 마운트한다. 완료·실패 작업과 파일은 유지보수 작업이 24시간 기준으로 정리한다.

## 2. 배포 전 확인

준비물은 실제 도메인, DNS를 가리킬 고정 공인 IP, SSH 키, 저장소 읽기 권한이다. 먼저 서버가 아닌 관리자 PC에서 아래 값을 실제 값으로 바꾸고 DNS A 레코드가 서버 IP를 가리키는지 확인한다.

macOS/Linux:

```bash
DEPLOY_DOMAIN='score.example.com'
DEPLOY_IP='203.0.113.10'
dig +short "$DEPLOY_DOMAIN" A
printf 'expected server IP: %s\n' "$DEPLOY_IP"
```

Windows PowerShell:

```powershell
$DeployDomain = 'score.example.com'
$DeployIp = '203.0.113.10'
Resolve-DnsName -Name $DeployDomain -Type A
Write-Output "expected server IP: $DeployIp"
```

DNS 결과와 VPS 공인 IP가 다르면 여기서 멈춘다. DNS 전파가 끝나기 전에는 Caddy가 공개 인증서를 발급받지 못할 수 있다.

## 3. Ubuntu 24.04 서버 준비

### 3.1 Docker 설치

Docker 공식 apt 저장소를 등록하는 데 필요한 패키지를 설치한다.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

Ubuntu 24.04(`noble`)용 Docker 저장소를 등록하고 엔진과 Compose 플러그인을 설치한다.

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

현재 SSH 사용자를 `docker` 그룹에 넣는다. 이 변경은 다음 로그인부터 적용되므로 명령 후 SSH 연결을 종료하고 다시 접속한다.

```bash
sudo usermod -aG docker "$USER"
```

재접속 후 설치 상태를 확인한다.

```bash
docker version
docker compose version
docker info --format '{{.ServerVersion}}'
```

### 3.2 방화벽

SSH를 먼저 허용한 다음 80/443만 추가한다. `ufw --force enable`은 확인 입력 없이 UFW를 켠다.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

VPS 업체의 보안 그룹/클라우드 방화벽도 TCP 22, 80, 443만 허용한다. 가능하면 22번은 관리자 IP로 제한한다.

> Docker가 공개한 포트는 UFW 규칙을 우회할 수 있다. 그래서 UFW만 믿지 않고 production Compose 자체에서 3000/6379 포트를 공개하지 않는다.

## 4. 저장소와 환경 설정

애플리케이션 전용 경로를 만들고 저장소를 복제한다. `REPOSITORY_URL`은 실제 Git URL로 바꾼다. 비공개 저장소라면 배포 전용 읽기 키나 토큰을 사용한다.

```bash
REPOSITORY_URL='https://github.com/OWNER/REPOSITORY.git'
sudo install -d -o "$USER" -g "$(id -gn)" /srv/pdf-score-mxl
git clone --branch main --single-branch "$REPOSITORY_URL" /srv/pdf-score-mxl
cd /srv/pdf-score-mxl
git status --short --branch
```

샘플을 복사하고 권한을 제한한 뒤 `DOMAIN`을 실제 도메인으로 바꾼다. 아래 예의 도메인을 그대로 사용하지 않는다.

```bash
cd /srv/pdf-score-mxl
install -m 600 .env.example .env
DEPLOY_DOMAIN='score.example.com'
sed -i "s/^DOMAIN=.*/DOMAIN=${DEPLOY_DOMAIN}/" .env
grep '^DOMAIN=' .env
```

기본 운영 값은 다음과 같다. 필요해도 `.env` 전체를 이슈·채팅·로그에 붙이지 말고, `.env`는 절대 커밋하지 않는다.

```dotenv
DOMAIN=score.example.com
REDIS_URL=redis://redis:6379
DATA_DIR=/data
CONVERSION_TIMEOUT_MS=1200000
RATE_LIMIT_DISABLED=0
NEXT_TELEMETRY_DISABLED=1
```

`HEARTBEAT_DISABLED`는 운영 환경에 설정하지 않는다. 엔진 버전을 명시적으로 고정하려면 검증된 버전만 `AUDIVERIS_VERSION=5.10.2`로 추가한다. 값을 바꾸면 worker 이미지를 다시 빌드해야 한다.

## 5. 운영 Compose 기동

모든 운영 명령은 개발 override가 자동 합병되지 않도록 아래 두 `-f` 옵션을 그대로 사용한다.

먼저 문법과 변수 치환을 검사한다.

```bash
cd /srv/pdf-score-mxl
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

운영 구성에 Caddy의 80/443 외에 공개 포트가 없는지 확인한다. 출력에서 `published: "3000"` 또는 `published: "6379"`가 나오면 기동하지 말고 Compose 파일을 점검한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -nE 'published: "?(80|443|3000|6379)"?'
```

이미지를 빌드하고 백그라운드로 기동한다. 첫 빌드는 Audiveris 소스와 Next.js 이미지를 만들기 때문에 오래 걸릴 수 있지만, 서비스는 `-d`로 실행되어 SSH 종료 후에도 유지된다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

`redis`, `worker`, `web`은 healthcheck 통과 후 `healthy`여야 하고 `caddy`는 `running`이어야 한다. 처음에는 `starting`일 수 있으므로 로그를 확인한 뒤 다시 `ps`를 실행한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=15m --tail=200 web worker redis caddy
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

## 6. 서버 내부 점검

`/api/health`는 web 프로세스만 확인한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)}).catch(e=>{console.error(e);process.exit(1)})"
```

Redis와 worker 하트비트를 따로 확인한다. 하트비트 나이가 90초 이하이고 Redis가 `PONG`을 반환해야 한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli ping
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T worker node -e "const fs=require('node:fs');const p='/tmp/worker-heartbeat';const age=(Date.now()-fs.statSync(p).mtimeMs)/1000;console.log(JSON.stringify({path:p,ageSeconds:Math.round(age)}));process.exit(age<=90?0:1)"
```

호스트가 3000/6379를 듣지 않는지 확인한다. 정상 운영 구성이라면 80/443만 공개된다.

```bash
sudo ss -lntp
curl --max-time 5 http://127.0.0.1:3000
```

마지막 curl은 연결 실패가 정상이다. Redis는 앞의 컨테이너 내부 `PING`으로 확인하며 호스트 6379번에 공개하지 않는다.

## 7. 인터넷에서 출시 점검

이 절차는 서버가 아닌 관리자 PC에서 실행한다. 도메인의 TLS 인증서와 보안 헤더를 확인한다.

```bash
DEPLOY_DOMAIN='score.example.com'
curl -fsS -o /dev/null -w 'HTTP %{http_code}, TLS verify %{ssl_verify_result}\n' "https://${DEPLOY_DOMAIN}/"
curl -fsSI "https://${DEPLOY_DOMAIN}/"
curl -fsS "https://${DEPLOY_DOMAIN}/api/status"
```

정상 응답의 `/api/status`는 대략 아래 형태다. `workers`는 1 이상, `diskFreeBytes`는 2GiB 이상이어야 한다. 일부 필드가 `null`이거나 `redis`가 `down`이면 HTTP 200이어도 정상 상태가 아니다.

```json
{"redis":"ok","workers":1,"waiting":0,"active":0,"diskFreeBytes":10000000000,"engineVersion":"5.10.2"}
```

HTTPS 응답에는 `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, 실제 도메인의 `Strict-Transport-Security`가 있어야 하며 `Server` 헤더는 없어야 한다.

VPS 공인 IP의 내부 포트가 차단됐는지 관리자 PC에서 확인한다. 아래 두 요청은 5초 안에 연결 실패 또는 timeout이어야 정상이다.

```bash
DEPLOY_IP='203.0.113.10'
curl --max-time 5 "http://${DEPLOY_IP}:3000"
curl --max-time 5 "http://${DEPLOY_IP}:6379"
```

마지막으로 권리 문제가 없는 `samples/simple.pdf`로 브라우저 전체 흐름을 확인한다.

1. `https://<실제 도메인>`에 접속했을 때 인증서 경고와 서비스 점검 배너가 없어야 한다.
2. `simple.pdf`를 올리고 카드가 `대기 중`에서 쪽·단계 기반 진행률로 바뀌는지 본다.
3. 완료 후 악보 미리보기가 렌더되고 MXL 다운로드가 열리는지 확인한다.
4. 다운로드한 파일을 압축 해제하거나 MusicXML 지원 프로그램에서 열어 손상되지 않았는지 확인한다.
5. 서버에서 완료 이벤트 한 줄과 전체 서비스 상태를 확인한다.

```bash
cd /srv/pdf-score-mxl
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m --tail=500 worker | grep '"event":"job_completed"'
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

도메인 HTTPS, 외부 `IP:3000` 차단, `/api/status`, 실제 업로드→진행률→미리보기→다운로드, `job_completed`까지 모두 확인해야 배포 완료다.

## 8. 안전한 갱신과 롤백

### 8.1 갱신 전

작업 트리가 깨끗한지 확인한다. 출력이 있으면 덮어쓰지 말고 원인을 확인한다.

```bash
cd /srv/pdf-score-mxl
git status --short
git rev-parse HEAD
```

현재 정상 커밋을 서버 밖의 배포 기록에도 남긴다. 아래 파일은 코드 롤백용 SHA만 저장하며 비밀 값은 넣지 않는다.

```bash
sudo install -d -m 700 -o "$USER" -g "$(id -gn)" /var/backups/pdf-score-mxl
git rev-parse HEAD > /var/backups/pdf-score-mxl/last-good-revision
cat /var/backups/pdf-score-mxl/last-good-revision
```

### 8.2 갱신

fast-forward만 허용해 서버에서 임의 merge commit이 생기지 않게 하고, 설정 검증 후 새 이미지를 기동한다.

```bash
cd /srv/pdf-score-mxl
git switch main
git pull --ff-only origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

갱신 뒤 §7의 `/api/status`와 `simple.pdf` 전체 흐름을 다시 확인한다. 검증 전에 이전 이미지를 삭제하거나 `docker system prune`을 실행하지 않는다.

### 8.3 코드 롤백

새 버전이 고장 났으면 기록한 커밋이 실제 Git 커밋인지 먼저 검증하고 detached 상태로 안전하게 되돌려 이미지를 다시 만든다. `.env`, Redis volume, `data/`는 이 과정에서 지워지지 않는다.

```bash
cd /srv/pdf-score-mxl
GOOD_REV="$(sed -n '1p' /var/backups/pdf-score-mxl/last-good-revision)"
git rev-parse --verify "${GOOD_REV}^{commit}"
git switch --detach "$GOOD_REV"
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

원인을 수정한 릴리스가 준비되면 `git switch main` 후 §8.2로 돌아간다. Redis 자료 구조 변경이 포함된 릴리스라면 코드만 되돌리지 말고, 별도 복제 서버에서 Redis 백업 복원을 먼저 시험한다.

## 9. 로그와 장애 확인 순서

로그는 무기한 follow하지 않고 최근 구간만 조회한다.

```bash
cd /srv/pdf-score-mxl
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m --tail=300 web
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m --tail=300 worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m --tail=300 redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m --tail=300 caddy
```

장애는 다음 순서로 좁힌다.

1. `curl https://<도메인>/api/status`의 JSON 필드를 본다. HTTP 200만으로 정상 판정하지 않는다.
2. `docker compose ... ps`에서 `web`, `worker`, `redis`의 health와 재시작 횟수를 본다.
3. `df`, `du`, `docker system df`로 호스트와 `/data` 여유 공간을 확인한다. 여유 공간이 2GiB 미만이면 업로드가 `STORAGE_FULL` 503으로 거부된다.
4. Redis `PING`과 worker 하트비트 나이를 §6 명령으로 확인한다. Redis 장애가 나면 하트비트도 갱신되지 않는 것이 정상이다.
5. web → worker → redis → caddy 순으로 최근 로그를 본다. worker의 `job_failed` 코드(`TIMEOUT`, `NO_OUTPUT`, `ENGINE_ERROR`, `INVALID_OUTPUT`)와 `heartbeat_failed`, `maintenance_scheduler_failed`를 확인한다.
6. Caddy 인증서 오류라면 DNS A 레코드, VPS 업체 방화벽, UFW 80/443을 확인한다.
7. 원인을 기록한 뒤 필요한 서비스 하나만 재시작한다. 전체 volume 삭제, `docker system prune -a --volumes`, `rm -rf data`는 복구 절차가 아니다.

서비스와 디스크 상태를 한 번에 모으는 읽기 전용 명령은 다음과 같다.

```bash
cd /srv/pdf-score-mxl
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
df -h / /var/lib/docker /srv/pdf-score-mxl/data
du -sh /srv/pdf-score-mxl/data
docker system df
curl -fsS "https://$(sed -n 's/^DOMAIN=//p' .env)/api/status"
```

## 10. 백업 원칙

- 소스 코드는 원격 Git 저장소와 배포 커밋 SHA로 복구한다.
- `.env`는 Git에 넣지 말고 접근 제한된 비밀 저장소에 별도로 보관한다. 채팅이나 일반 로그에 전문을 붙이지 않는다.
- Redis는 AOF를 `redisdata` named volume에 저장한다. 큐 복구가 필요하다면 아래처럼 일관된 RDB 스냅샷을 만든다.
- `./data/jobs`에는 사용자의 원본 PDF와 결과가 있고 24시간 정리 대상이다. 기본 정책에서는 장기 백업하지 않는다. VPS 전체 스냅샷을 사용하면 이 개인정보도 포함되므로 암호화·접근 권한·보존 기간을 함께 정한다.
- Caddy 인증서 volume은 잃어도 도메인과 80/443 접근이 정상이라면 재발급할 수 있다. 인증서 파일을 다른 서버에 임의 복사하지 않는다.

Redis RDB를 서버의 제한된 디렉터리에 저장하고 해시를 기록한다.

```bash
cd /srv/pdf-score-mxl
sudo install -d -m 700 -o "$USER" -g "$(id -gn)" /var/backups/pdf-score-mxl
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T redis redis-cli SAVE
BACKUP_FILE="/var/backups/pdf-score-mxl/redis-$(date -u +%Y%m%dT%H%M%SZ).rdb"
docker compose -f docker-compose.yml -f docker-compose.prod.yml cp redis:/data/dump.rdb "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
sha256sum "$BACKUP_FILE"
```

백업은 생성만으로 끝나지 않는다. 별도 비운영 서버에서 복원을 시험하고, RDB를 덮어쓰기 전에 대상 volume과 백업 해시를 다시 확인한다. 운영 Redis volume 삭제나 복원은 진행 중인 작업을 잃을 수 있으므로 장애 대응 중 즉흥적으로 실행하지 않는다.
