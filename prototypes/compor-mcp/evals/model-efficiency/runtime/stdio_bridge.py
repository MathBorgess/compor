#!/usr/bin/env python3
"""Transparent, observed stdio transport for the synthetic Compor benchmark."""
import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--log', required=True)
    parser.add_argument('--node', required=True)
    parser.add_argument('--entry', required=True)
    args = parser.parse_args()
    lock = threading.Lock()
    log = Path(args.log).open('a', encoding='utf-8')
    process = subprocess.Popen([args.node, args.entry], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=sys.stderr, text=True,
                               bufsize=1, env=os.environ.copy())

    def record(direction, line):
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            message = {'invalid_json': True, 'byte_length': len(line.encode())}
        with lock:
            log.write(json.dumps({'monotonic_ns': time.monotonic_ns(),
                                  'process_id': os.getpid(), 'direction': direction,
                                  'message': message}, ensure_ascii=False) + '\n')
            log.flush()

    def read_child():
        for line in process.stdout:
            record('server_to_client', line)
            sys.stdout.write(line)
            sys.stdout.flush()

    reader = threading.Thread(target=read_child, daemon=True)
    reader.start()
    try:
        for line in sys.stdin:
            record('client_to_server', line)
            process.stdin.write(line)
            process.stdin.flush()
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        reader.join(timeout=2)
        log.close()


if __name__ == '__main__':
    main()
