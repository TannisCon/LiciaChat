# 🚀 生产环境部署指南

## 部署前检查清单

- [ ] 修改 `config.yaml` 中的 `admin_email` 和 `jwt_secret`
- [ ] 修改 `config.yaml` 中的 `api_key_encryption_key`（32 字节随机字符串）
- [ ] 配置环境变量 `DASHSCOPE_API_KEY`
- [ ] 确保数据库文件 `database.db` 的访问权限安全
- [ ] 配置防火墙，仅开放必要端口（80/443）
- [ ] 准备 SSL 证书（推荐使用 Let's Encrypt 免费证书）

> ⚠️ **重要警告**
> - 部署前确保修改好配置文件和环境变量！
> - 部署后立刻修改初始管理员密码！
> - 生产环境请确保数据库文件的安全！
> - 妥善保管 `api_key_encryption_key`，丢失将导致用户 API Key 无法解密！

---

## ⚠️ 公网部署提示

**公网部署时请自行处理以下事项：**

- **安全防护**：配置防火墙、Rate Limit、DDoS 防护等，避免 API 被滥用
- **SSE 流式传输**：确保 CDN 或反向代理正确配置，禁用 SSE 端点的缓存（`proxy_buffering off`、`proxy_cache_bypass $http_upgrade`），否则流式响应将被缓存导致前端无法正常接收
- **缓存策略**：合理配置静态资源和 API 的缓存策略
- **日志监控**：有需要的自行配置日志收集和告警系统，需要确保日志中不记录用户的明文API KEY

---

## 方案一：Gunicorn + Uvicorn 部署（推荐）

### 1. 安装依赖

```bash
pip install gunicorn
```

### 2. 启动服务

```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 3. 配置 systemd 服务（Linux）

创建 `/etc/systemd/system/liciachat.service`：

```ini
[Unit]
Description=LiciaChat Backend Service
After=network.target

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/path/to/LiciaChat
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000
Restart=always
RestartSec=10

# 安全配置
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable liciachat
sudo systemctl start liciachat
```

---

## 方案二：Docker 部署

### 1. 创建 Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# 复制应用代码
COPY . .

# 创建非 root 用户
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 启动命令
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

### 2. 构建镜像

```bash
docker build -t liciachat-backend .
```

### 3. 运行容器

```bash
docker run -d \
  --name liciachat \
  -p 8000:8000 \
  -e DASHSCOPE_API_KEY=your-api-key \
  -v /path/to/config.yaml:/app/config.yaml:ro \
  -v /path/to/database.db:/app/database.db \
  --restart unless-stopped \
  liciachat-backend
```

### 4. Docker Compose 部署（可选）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    build: .
    container_name: liciachat-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
    volumes:
      - ./config.yaml:/app/config.yaml:ro
      - ./database.db:/app/database.db
    networks:
      - liciachat-network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: liciachat-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - liciachat-network

networks:
  liciachat-network:
    driver: bridge
```

运行：

```bash
docker-compose up -d
```


### Nginx 配置示例

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务器
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /path/to/fullchain.crt;
    ssl_certificate_key /path/to/privkey.key;
    
    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS (可选，确保测试无误后再启用)
    # add_header Strict-Transport-Security "max-age=63072000" always;

    # 前端静态文件
    location / {
        root /path/to/LiciaChat/static/dist;
        try_files $uri $uri/ /index.html;
        
        # 缓存控制
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        
        # WebSocket 支持（流式响应）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # 传递真实客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # 禁用缓冲（流式响应必需）
        proxy_buffering off;
        proxy_cache off;
    	  proxy_redirect off;
        proxy_cache_bypass $http_upgrade;

        # 禁止缓存
    	  add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }
    location /v1/ {
        proxy_pass http://127.0.0.1:8000;  # 末尾无斜杠，路径原样透传
        proxy_set_header X-Real-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $http_cf_connecting_ip;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_redirect off;
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }

    # 禁止访问敏感文件
    location ~ /\. {
        deny all;
    }
    
    location ~* \.(db|yaml|yml|env)$ {
        deny all;
    }
}
```
