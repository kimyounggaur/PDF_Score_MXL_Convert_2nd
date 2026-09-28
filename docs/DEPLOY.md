# 배포 가이드

Ubuntu 24.04 VPS 1대에서 Docker Compose로 실행하는 기준이다. 실제 도메인과 서버 IP는 준비 후 `.env`에 넣는다.

Vercel 단독 배포는 지원하지 않는다.
변환에 Redis 큐, 상주 Audiveris 워커, web/worker가 공유하는 `/data`, 최대 20분의 작업 실행 환경이 필요하기 때문이다.
전체 기능은 아래의 VPS + Docker Compose 구성으로만 배포한다.

## 1. 서버 준비

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

로그아웃 후 다시 접속해서 `docker compose version`이 보이는지 확인한다.

## 2. 방화벽

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> Docker가 공개한 포트는 UFW 방화벽 규칙을 우회할 수 있다. 운영에서는 Caddy의 80/443만 열고 web 3000번과 Redis 6379번을 절대 호스트에 공개하지 말아야 한다.

## 3. 애플리케이션 배치

```bash
git clone <REPOSITORY_URL> pdf-score-mxl
cd pdf-score-mxl
cp .env.example .env
```

`.env`에서 `DOMAIN`을 실제 도메인으로 바꾼다. DNS A 레코드는 서버 IP를 가리켜야 한다.

## 4. 실행

Compose 파일은 다음처럼 역할을 나눈다.

- `docker-compose.yml`: 공통 서비스. web/Redis 호스트 포트는 없다.
- `docker-compose.override.yml`: 로컬 개발 전용. `docker compose up`에서 자동 합병되어 web 3000번과 localhost Redis 6379번을 연다.
- `docker-compose.prod.yml`: Caddy와 운영 이미지. 아래처럼 `-f`로 파일을 명시하면 개발용 override는 합병되지 않는다.

VPS에서는 bare `docker compose up`을 실행하지 말고, 반드시 아래의 명시적인 두 `-f` 옵션을 그대로 사용한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

처음 빌드는 Audiveris 소스 빌드와 Next.js 이미지 빌드 때문에 오래 걸릴 수 있다.

## 5. 확인

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 web worker
APP_DOMAIN="$(sed -n 's/^DOMAIN=//p' .env)"
curl -I "https://${APP_DOMAIN}"
curl --max-time 5 http://localhost:3000
```

정상이면 web은 `healthy`, caddy는 `running`이다. HTTPS 응답에는 `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`이 있고 `Server` 헤더는 없어야 한다. `Strict-Transport-Security`는 실제 도메인일 때만 추가되며 localhost 리허설에서는 빠진다.

`curl --max-time 5 http://localhost:3000`은 연결 실패해야 한다. 응답이 오면 개발용 `docker-compose.override.yml`이 운영 명령에 잘못 합병된 것이다.

브라우저에서 `https://<DOMAIN>`으로 접속해 `samples/simple.pdf`를 업로드하고, 완료 후 미리보기와 다운로드를 확인한다.

## 6. 갱신

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

## 7. 백업

Redis는 `redisdata` named volume에 AOF를 저장한다. 장기 보관이 필요하면 정기적으로 볼륨을 압축한다.

```bash
docker run --rm -v pdf-score-mxl_redisdata:/data -v "$PWD/backups:/backup" alpine tar czf /backup/redisdata-$(date +%Y%m%d-%H%M%S).tgz -C /data .
```

`./data/jobs`는 24시간 TTL 대상이므로 영구 백업 대상이 아니다.

## 8. 장애 확인

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 web
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 caddy
```

자주 볼 항목:

- `worker` 로그의 `job_failed` 코드: `TIMEOUT`, `NO_OUTPUT`, `ENGINE_ERROR`, `INVALID_OUTPUT`
- `redis` health 상태
- `caddy` 인증서 발급 오류: DNS가 서버 IP를 가리키는지 확인
- `/data` 권한 오류: web/worker 컨테이너가 같은 uid 1000으로 실행되는지 확인

