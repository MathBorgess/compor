"""Forward a single MCP stdio connection to a private local Unix socket."""
import socket
import json
import os
import subprocess
import sys
import threading

if len(sys.argv) == 3:
    paste = subprocess.run(['/usr/bin/pbpaste'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5)
    with open(sys.argv[2], 'x', encoding='utf8') as report:
        json.dump({'clipboard_blocked':paste.returncode != 0 and not paste.stdout,
                   'process_environment_has_api_key': bool(os.environ.get('OPENAI_API_KEY'))}, report)

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect(sys.argv[1])

def upstream():
    try:
        while chunk := sys.stdin.buffer.read1(65536):
            sock.sendall(chunk)
    finally:
        try:
            sock.shutdown(socket.SHUT_WR)
        except OSError:
            pass

thread = threading.Thread(target=upstream, daemon=True)
thread.start()
while chunk := sock.recv(65536):
    sys.stdout.buffer.write(chunk)
    sys.stdout.buffer.flush()
