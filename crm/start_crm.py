from __future__ import annotations

import os
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse


PROJECT_DIR = Path(__file__).resolve().parent
CLIENT_DIR = PROJECT_DIR / "client"
SERVER_DIR = PROJECT_DIR / "server"
RUNTIME_DIR = PROJECT_DIR / ".runtime"
LOG_DIR = RUNTIME_DIR / "logs"
PUBLIC_URL_FILE = RUNTIME_DIR / "public_url.txt"
API_PORT = 3001
VITE_PORT = 5174
START_DEV_FRONTEND = os.environ.get('CRM_START_VITE', '').lower() in {'1', 'true', 'yes'}
CLOUDFLARED = Path(r"C:\Program Files (x86)\cloudflared\cloudflared.exe")
SERVER_ENV = SERVER_DIR / ".env"
QUICK_TUNNEL_HOME = RUNTIME_DIR / "quick-tunnel-home"


def log(message: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line, flush=True)
    with (LOG_DIR / "launcher.log").open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.25)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def quick_tunnel_running() -> bool:
    if os.name != "nt":
        return False
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Select-Object -ExpandProperty CommandLine",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    command_lines = result.stdout.lower()
    return "tunnel --url" in command_lines and f"127.0.0.1:{API_PORT}" in command_lines


def quick_tunnel_url(log_offset: int = 0) -> str | None:
    log_path = LOG_DIR / "cloudflared.log"
    if not log_path.exists():
        return None

    try:
        with log_path.open("r", encoding="utf-8", errors="replace") as log_file:
            log_file.seek(log_offset)
            contents = log_file.read()
    except OSError:
        return None

    matches = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", contents, re.IGNORECASE)
    return matches[-1] if matches else None


def wait_for_quick_tunnel_url(log_offset: int, timeout: int = 30) -> str | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        url = quick_tunnel_url(log_offset)
        if url:
            return url
        time.sleep(0.5)
    return None


def quick_tunnel_environment() -> dict[str, str]:
    """Keep Quick Tunnel isolated from the existing named-tunnel configuration."""
    QUICK_TUNNEL_HOME.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment["USERPROFILE"] = str(QUICK_TUNNEL_HOME)
    environment["HOME"] = str(QUICK_TUNNEL_HOME)
    return environment


def command(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(f"Comando não encontrado: {name}")


def start_process(
    label: str,
    args: list[str],
    cwd: Path,
    log_name: str,
    process_env: dict[str, str] | None = None,
) -> subprocess.Popen:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = (LOG_DIR / log_name).open("a", encoding="utf-8")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        args,
        cwd=str(cwd),
        stdout=log_file,
        stderr=subprocess.STDOUT,
        creationflags=flags,
        env=process_env or os.environ.copy(),
    )
    log(f"{label} iniciado (PID {process.pid})")
    return process


def wait_for_port(label: str, port: int, timeout: int = 30) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port):
            log(f"{label} respondendo em http://127.0.0.1:{port}")
            return True
        time.sleep(0.5)
    log(f"AVISO: {label} não abriu a porta {port} em {timeout}s")
    return False


def frontend_needs_build() -> bool:
    dist_index = CLIENT_DIR / "dist" / "index.html"
    if not dist_index.exists():
        return True
    dist_time = dist_index.stat().st_mtime
    return any(
        path.stat().st_mtime > dist_time
        for path in (CLIENT_DIR / "src").rglob("*")
        if path.is_file()
    )


def cloudflare_edge_ip(url: str) -> str | None:
    hostname = urlparse(url).hostname
    if not hostname:
        return None
    result = subprocess.run(
        ["nslookup", hostname, "1.1.1.1"],
        capture_output=True,
        text=True,
        check=False,
    )
    addresses = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", result.stdout)
    return next((address for address in addresses if address not in {"1.1.1.1", "1.0.0.1"}), None)


def open_chrome(url: str, resolver_ip: str | None = None) -> None:
    chrome_paths = [
        Path(os.environ.get("PROGRAMFILES", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    chrome = next((path for path in chrome_paths if path.exists()), None)
    if chrome:
        args = [str(chrome)]
        hostname = urlparse(url).hostname
        if resolver_ip and hostname:
            profile_dir = RUNTIME_DIR / "chrome-public" / hostname
            profile_dir.mkdir(parents=True, exist_ok=True)
            args.extend(
                [
                    f"--user-data-dir={profile_dir}",
                    f"--host-resolver-rules=MAP {hostname} {resolver_ip}",
                ]
            )
        args.append(url)
        subprocess.Popen(args, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    else:
        import webbrowser

        webbrowser.open(url)


def neon_configured() -> bool:
    if os.environ.get("DATABASE_URL"):
        return True
    if not SERVER_ENV.exists():
        return False
    return any(
        line.strip().startswith("DATABASE_URL=") and line.split("=", 1)[1].strip()
        for line in SERVER_ENV.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )


def main() -> int:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log("Inicializando Grupo YR CRM")

    npm = command("npm.cmd" if os.name == "nt" else "npm")
    if frontend_needs_build():
        log("Frontend desatualizado; gerando client/dist")
        result = subprocess.run([npm, "run", "build"], cwd=str(CLIENT_DIR), check=False)
        if result.returncode != 0:
            log(f"ERRO: build do frontend falhou com código {result.returncode}")
            return result.returncode

    if port_open(API_PORT):
        log(f"Backend já estava ativo na porta {API_PORT}")
    else:
        backend_environment = os.environ.copy()
        # O provedor salvo no Neon deve ser respeitado. Sem uma variável de
        # ambiente forçada, o backend usa a última escolha feita no CRM
        # (Baileys ou Meta Cloud API) também após reiniciar o computador.
        start_process("Backend/API", [npm, "start"], SERVER_DIR, "backend.log", backend_environment)
        wait_for_port("Backend/API", API_PORT)

    if START_DEV_FRONTEND:
        if port_open(VITE_PORT):
            log(f"Frontend Vite já estava ativo na porta {VITE_PORT}")
        else:
            start_process(
                "Frontend Vite (desenvolvimento)",
                [npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", str(VITE_PORT)],
                CLIENT_DIR,
                "frontend.log",
            )
            wait_for_port("Frontend Vite", VITE_PORT)
    else:
        log("Frontend servido pelo backend em client/dist")

    public_url = None
    if not neon_configured():
        log("AVISO: DATABASE_URL não configurada; tunnel público não será iniciado")
    elif not CLOUDFLARED.exists():
        log("AVISO: Cloudflared não encontrado; CRM seguirá disponível somente neste computador")
    else:
        tunnel_log = LOG_DIR / "cloudflared.log"
        log_offset = tunnel_log.stat().st_size if tunnel_log.exists() else 0
        if quick_tunnel_running():
            public_url = quick_tunnel_url()
            if public_url:
                log(f"Tunnel público temporário já ativo: {public_url}")
            else:
                log("Tunnel Cloudflare temporário já está ativo; aguardando URL no log")
        else:
            start_process(
                "Tunnel Cloudflare temporário",
                [str(CLOUDFLARED), "tunnel", "--url", f"http://127.0.0.1:{API_PORT}"],
                PROJECT_DIR,
                "cloudflared.log",
                quick_tunnel_environment(),
            )
            public_url = wait_for_quick_tunnel_url(log_offset)
            if public_url:
                log(f"Tunnel público temporário pronto: {public_url}")
            else:
                log("AVISO: tunnel iniciado, mas a URL pública não apareceu a tempo. Veja cloudflared.log")

    if public_url:
        PUBLIC_URL_FILE.write_text(public_url, encoding="utf-8")
    elif PUBLIC_URL_FILE.exists():
        PUBLIC_URL_FILE.unlink()

    open_chrome(f"http://127.0.0.1:{API_PORT}/")
    if public_url:
        edge_ip = cloudflare_edge_ip(public_url)
        open_chrome(public_url, edge_ip)
    if neon_configured():
        log("CRM aberto com configuração Neon disponível")
    else:
        log("CRM aberto em modo local temporário; configure o Neon antes de expor na internet")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
