import sys
import io
import json
import base64
import re
from http.server import BaseHTTPRequestHandler
import pdfplumber

def parse_tables_from_pdf_bytes(pdf_bytes: bytes) -> dict:
    if not pdf_bytes:
        return {"success": False, "error": "Empty PDF payload received", "tables": []}
    
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return {"success": False, "error": "PDF has 0 pages", "tables": []}
            
            # 100% Deterministic Table Extraction using pdf.pages[0].extract_tables()
            raw_page0_tables = pdf.pages[0].extract_tables()
            
            cleaned_tables = []
            
            def clean_table(raw_table):
                if not raw_table:
                    return []
                cleaned_rows = []
                for row in raw_table:
                    if not row:
                        continue
                    cleaned_row = [
                        (str(cell).strip() if cell is not None else "")
                        for cell in row
                    ]
                    # Filter out rows that are entirely blank
                    if any(c != "" for c in cleaned_row):
                        cleaned_rows.append(cleaned_row)
                return cleaned_rows

            if raw_page0_tables:
                for t in raw_page0_tables:
                    c = clean_table(t)
                    if c:
                        cleaned_tables.append(c)
            
            # If document contains multiple pages, collect tables across all pages
            if page_count > 1:
                for p_idx in range(1, page_count):
                    page_tables = pdf.pages[p_idx].extract_tables()
                    if page_tables:
                        for t in page_tables:
                            c = clean_table(t)
                            if c:
                                cleaned_tables.append(c)

            return {
                "success": True,
                "tables": cleaned_tables,
                "pageCount": page_count,
                "totalTables": len(cleaned_tables)
            }
    except Exception as e:
        return {"success": False, "error": str(e), "tables": []}

def extract_pdf_bytes_from_request(headers, rfile) -> bytes:
    content_length = int(headers.get('Content-Length', 0))
    if content_length <= 0:
        return b''
    
    body = rfile.read(content_length)
    content_type = headers.get('Content-Type', '')

    # 1. JSON payload with fileBase64 or pdfBase64
    if 'application/json' in content_type:
        try:
            data = json.loads(body.decode('utf-8'))
            b64_str = (
                data.get('fileBase64')
                or data.get('pdfBase64')
                or data.get('file')
                or data.get('data')
            )
            if b64_str:
                if ',' in b64_str:
                    b64_str = b64_str.split(',', 1)[1]
                return base64.b64decode(b64_str)
        except Exception:
            pass

    # 2. Raw PDF binary
    if 'application/pdf' in content_type or body.startswith(b'%PDF'):
        return body

    # 3. Multipart/form-data
    if 'multipart/form-data' in content_type:
        match = re.search(r'boundary=([^\s;]+)', content_type)
        if match:
            boundary = match.group(1).encode('utf-8')
            if boundary.startswith(b'"') and boundary.endswith(b'"'):
                boundary = boundary[1:-1]
            parts = body.split(b'--' + boundary)
            for part in parts:
                if b'filename=' in part or b'name="file"' in part or b'%PDF' in part:
                    if b'\r\n\r\n' in part:
                        file_data = part.split(b'\r\n\r\n', 1)[1]
                    elif b'\n\n' in part:
                        file_data = part.split(b'\n\n', 1)[1]
                    else:
                        continue
                    file_data = re.sub(b'\r\n$', b'', file_data)
                    file_data = re.sub(b'\n$', b'', file_data)
                    if b'%PDF' in file_data:
                        pdf_start = file_data.find(b'%PDF')
                        return file_data[pdf_start:]
                    return file_data

    # Fallback search for PDF magic bytes
    if b'%PDF' in body:
        pdf_start = body.find(b'%PDF')
        return body[pdf_start:]

    return body

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ready", "service": "deterministic-pdf-extractor"}).encode('utf-8'))

    def do_POST(self):
        try:
            pdf_bytes = extract_pdf_bytes_from_request(self.headers, self.rfile)
            result = parse_tables_from_pdf_bytes(pdf_bytes)
            status_code = 200 if result.get("success") else 400

            self.send_response(status_code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'rb') as f:
            pdf_bytes = f.read()
    else:
        pdf_bytes = sys.stdin.buffer.read()
    res = parse_tables_from_pdf_bytes(pdf_bytes)
    print(json.dumps(res))
