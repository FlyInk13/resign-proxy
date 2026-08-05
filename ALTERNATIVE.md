# Alternative: mitmproxy

mitmproxy — зрелый Python-прокси с поддержкой TLS-инспекции. Позволяет решить ту же задачу минимальной конфигурацией.

## Установка

```bash
pip install mitmproxy
```

Или Docker:
```bash
docker run --rm -it -p 8080:8080 -p 8081:8081 \
  -v ~/.mitmproxy:/home/mitmproxy/.mitmproxy \
  mitmproxy/mitmproxy mitmweb --web-host 0.0.0.0
```

## Шаги

### 1. Первый запуск — генерация CA

```bash
mitmdump --no-server
```

CA генерируется автоматически в `~/.mitmproxy/mitmproxy-ca-cert.pem`.

### 2. Установить CA на устройства

**macOS:**
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ~/.mitmproxy/mitmproxy-ca-cert.pem
```

**iOS:** AirDrop файл `.pem` → Настройки → Основные → VPN и управление устройством → Доверять.

**Android:** Настройки → Безопасность → Установить сертификат → CA.

### 3. Настройка whitelist

`~/.mitmproxy/config.yaml`:
```yaml
# Туннелировать всё по умолчанию
ignore_hosts:
  - ".*"

# Кроме этих доменов — их перехватывать
allow_hosts:
  - "gosuslugi\\.ru"
  - "nalog\\.gov\\.ru"
  - "mos\\.ru"
  - "sfr\\.gov\\.ru"
  - "rosreestr\\.gov\\.ru"
  - "digital\\.gov\\.ru"
```

### 4. Аддон проверки Минцифры CA

```python
# mintsifry_check.py
from mitmproxy import tls
import logging

MINTSIFRY_MARKERS = (
    "The Ministry of Digital Development and Communications",
    "Russian Trusted Root CA",
    "Russian Trusted Sub CA",
)

def tls_established_server(data: tls.TlsData):
    """Проверяет, что перехваченный домен действительно использует Минцифры CA."""
    host = data.context.server.address[0]

    for cert in data.conn.certificate_list or []:
        issuer = str(cert.issuer)
        if any(m in issuer for m in MINTSIFRY_MARKERS):
            logging.info(f"[OK] {host} — Минцифры CA подтверждён")
            return

    logging.warning(
        f"[WARN] {host} — НЕ Минцифры CA! Возможна подмена или домен сменил CA."
    )
```

### 5. Запуск

```bash
# Интерактивный TUI
mitmproxy -s mintsifry_check.py

# Headless (для сервера/Docker)
mitmdump -s mintsifry_check.py

# Web UI на :8081
mitmweb -s mintsifry_check.py --web-host 0.0.0.0
```

### 6. Настройка клиентов

Выставить HTTP-прокси: `<IP-сервера>:8080`.

## Docker Compose

```yaml
services:
  mitmproxy:
    image: mitmproxy/mitmproxy
    ports:
      - "8080:8080"
      - "8081:8081"
    volumes:
      - ./mitmproxy-data:/home/mitmproxy/.mitmproxy
      - ./mintsifry_check.py:/home/mitmproxy/addon.py
      - ./config.yaml:/home/mitmproxy/.mitmproxy/config.yaml
    command: mitmweb --web-host 0.0.0.0 -s /home/mitmproxy/addon.py
    restart: unless-stopped
```

## Ограничения по сравнению с кастомной реализацией

- Зависимость Python (~150 MB образ)
- Конфиг размазан по YAML + Python
- Меньше контроля над генерацией сертификатов и логикой кеша
