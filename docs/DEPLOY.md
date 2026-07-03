# 배포 가이드

Ubuntu 24.04 VPS 1대에서 Docker Compose로 실행하는 기준이다. 실제 도메인과 서버 IP는 준비 후 `.env`에 넣는다.

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

## 3. 애플리케이션 배치

```bash
git clone <REPOSITORY_URL> pdf-score-mxl
cd pdf-score-mxl
cp .env.example .env
```

`.env`에서 `DOMAIN`을 실제 도메인으로 바꾼다. DNS A 레코드는 서버 IP를 가리켜야 한다.

## 4. 실행

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

처음 빌드는 Audiveris 소스 빌드와 Next.js 이미지 빌드 때문에 오래 걸릴 수 있다.

## 5. 확인

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
```

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

