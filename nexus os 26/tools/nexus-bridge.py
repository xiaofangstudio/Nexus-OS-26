#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nexus OS 26 · 本地桥（nexus-bridge.py）
═══════════════════════════════════════
让网页版 Nexus OS 26 能【真读取本机系统文件】的只读桥。

浏览器沙盒平时碰不到 C:\\ D:\\，这个小桥在 127.0.0.1:8899 上开一个
只读的文件接口，文件管理器的「真实系统」分区会自动发现它并列出
真实的盘符与目录。

用法（任选其一）：
    python nexus-bridge.py            # 默认端口 8899
    python nexus-bridge.py 9000       # 自定义端口

接口（全部只读，全开 CORS，只监听 127.0.0.1）：
    GET /api/roots            → 真实盘符列表
    GET /api/ls?path=C:\\      → 目录列表 [{name,isDir,size,mtime}]
    GET /api/read?path=...    → 文本内容（≤ 4MB）
    GET /api/file?path=...    → 原始字节（图片/音频预览）
    GET /api/ping             → 健康检查

安全边界：
    * 只监听 127.0.0.1，外网进不来
    * 只实现 GET，没有任何写/删/改名接口
    * 默认隐藏以 . 开头的系统隐藏文件
"""
import json
import os
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
MAX_TEXT = 4 * 1024 * 1024          # 文本读取上限 4MB
MAX_STREAM = 64 * 1024 * 1024       # 原始文件上限 64MB

TEXT_EXT = {
    '.txt', '.md', '.js', '.ts', '.css', '.html', '.htm', '.json', '.py',
    '.cw', '.nex', '.csv', '.log', '.ini', '.cfg', '.yml', '.yaml', '.xml',
    '.svg', '.bat', '.ps1', '.sh', '.c', '.cpp', '.h', '.java', '.rs', '.go'
}
IMG_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico'}
AUDIO_EXT = {'.mp3', '.wav', '.ogg', '.m4a', '.flac'}
VIDEO_EXT = {'.mp4', '.webm', '.mov'}

MIME = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.json': 'application/json', '.pdf': 'application/pdf',
}


def list_drives():
    """枚举 Windows 盘符（C:\\ D:\\ ...）；非 Windows 时给出常用目录。"""
    drives = []
    if os.name == 'nt':
        import string
        for letter in string.ascii_uppercase:
            root = letter + ':\\'
            if os.path.exists(root):
                try:
                    os.listdir(root)
                    drives.append({'name': letter + ':', 'path': root, 'ok': True})
                except PermissionError:
                    drives.append({'name': letter + ':', 'path': root, 'ok': False})
    else:
        for p in ('/', os.path.expanduser('~')):
            drives.append({'name': p, 'path': p, 'ok': True})
    return drives


def entry_of(full):
    try:
        st = os.stat(full)
    except (OSError, ValueError):
        return None
    return {
        'name': os.path.basename(full) or full,
        'isDir': os.path.isdir(full),
        'size': st.st_size if os.path.isfile(full) else 0,
        'mtime': int(st.st_mtime * 1000),
    }


class Bridge(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _err(self, msg, code=400):
        self._json({'error': msg}, code)

    def log_message(self, fmt, *args):
        pass  # 安静运行

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        get = lambda k: (qs.get(k, [''])[0] or '')

        if parsed.path == '/api/ping':
            return self._json({'ok': True, 'bridge': 'nexus-bridge', 'version': 1})
        if parsed.path == '/api/roots':
            return self._json({'roots': list_drives()})

        path = get('path')
        if not path:
            return self._err('missing path')
        path = os.path.normpath(path)

        if parsed.path == '/api/ls':
            if not os.path.isdir(path):
                return self._err('not a directory: ' + path, 404)
            out = []
            try:
                names = os.listdir(path)
            except PermissionError:
                return self._err('permission denied', 403)
            except OSError as e:
                return self._err(str(e), 404)
            for n in names:
                if n.startswith('.') or n.startswith('$'):
                    continue  # 系统隐藏条目
                ent = entry_of(os.path.join(path, n))
                if ent:
                    out.append(ent)
            out.sort(key=lambda e: (not e['isDir'], e['name'].lower()))
            return self._json({'path': path, 'entries': out})

        if parsed.path == '/api/read':
            if not os.path.isfile(path):
                return self._err('not a file: ' + path, 404)
            if os.path.getsize(path) > MAX_TEXT:
                return self._err('file too large for text view', 413)
            try:
                with open(path, 'rb') as f:
                    raw = f.read()
            except OSError as e:
                return self._err(str(e), 403)
            for enc in ('utf-8', 'utf-16', 'gbk'):
                try:
                    return self._json({'path': path, 'text': raw.decode(enc), 'encoding': enc})
                except (UnicodeDecodeError, LookupError):
                    continue
            return self._err('binary file, use /api/file', 415)

        if parsed.path == '/api/file':
            if not os.path.isfile(path):
                return self._err('not a file: ' + path, 404)
            size = os.path.getsize(path)
            if size > MAX_STREAM:
                return self._err('file too large', 413)
            ext = os.path.splitext(path)[1].lower()
            mime = MIME.get(ext, 'application/octet-stream')
            try:
                with open(path, 'rb') as f:
                    raw = f.read()
            except OSError as e:
                return self._err(str(e), 403)
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)
            return

        return self._err('unknown endpoint', 404)


if __name__ == '__main__':
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Bridge)
    print('Nexus OS 26 本地桥已启动：http://127.0.0.1:%d' % PORT)
    print('只读模式 · 只监听本机 · 关掉这个窗口即停止')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
