import sys
import io
import json
import base64
import re
from http.server import BaseHTTPRequestHandler
import pdfplumber

def parse_text_lines_to_table(text_lines):
    rows = []
    
    for line in text_lines:
        line = line.strip()
        if not line or len(line) < 4:
            continue
            
        line_lower = line.lower()
        if line_lower.startswith(('total', 'subtotal', 'date:', 'page ', 'terms', 'condition', 'phone', 'email', 'gst')):
            continue
        if re.search(r'\b(rate|price|mrp)\b', line_lower) and not re.search(r'\d+\.\d{2}', line):
            continue

        # Look for rate at the end of the line:
        single_match = re.search(r'(?:(?:Rs\.?|INR|₹|@)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:/-)?(?:\s*/?\s*(Pcs|Box|Packet|Dozen|Set|Kg|Gross|kg|mtr|pair))?\s*$', line, re.I)
        
        if single_match:
            try:
                rate_val = float(single_match.group(1).replace(',', ''))
            except:
                continue
            unit_val = single_match.group(2) or 'Pcs'
            rem = line[:single_match.start()].strip(' -:•\t,')
            
            if rate_val <= 0 or not rem:
                continue

            # Check if line contains multiple variants/rates
            sub_matches = list(re.finditer(r'([a-zA-Z0-9/x.\s\(\)]+?)\s+(?:(?:Rs\.?|INR|₹)\s*)?(\d+(?:\.\d{1,2})?)(?:\s*(?:Pcs|Box|/-))?(?:\s*[,;|]\s*|\s+|$)', line, re.I))
            if len(sub_matches) >= 2 and all(float(m.group(2)) > 5 for m in sub_matches):
                first_text = sub_matches[0].group(1).strip()
                base_prod = first_text
                var0 = ''
                vm = re.search(r'\b(standard|heavy|deluxe|antic|brass|black|\d+\s*(?:mm|inch|in)|\d+\s*x\s*[\d/]+(?:\s*x\s*[\d/]+)?)\b.*$', first_text, re.I)
                if vm and vm.start() > 0:
                    base_prod = first_text[:vm.start()].strip(' -:•\t,')
                    var0 = first_text[vm.start():].strip(' -:•\t,')
                
                rows.append([base_prod, var0, sub_matches[0].group(2), 'Pcs'])
                for sm in sub_matches[1:]:
                    v_part = sm.group(1).strip(' -:•\t,')
                    r_part = sm.group(2)
                    rows.append([base_prod, v_part, r_part, 'Pcs'])
                continue

            # Single item line:
            var_match = re.search(r'\b(standard|heavy|deluxe|antic|brass|black|\d+\s*(?:mm|inch|in)|\d+\s*x\s*[\d/]+(?:\s*x\s*[\d/]+)?)\b.*$', rem, re.I)
            if var_match and var_match.start() > 0:
                prod = rem[:var_match.start()].strip(' -:•\t,')
                var = rem[var_match.start():].strip(' -:•\t,')
            else:
                prod = rem
                var = ''
                
            rows.append([prod, var, str(rate_val), unit_val])

    if rows:
        return [['Product Name', 'Size / Variant', 'Rate', 'Unit']] + rows
    return []

def parse_tables_from_pdf_bytes(pdf_bytes: bytes) -> dict:
    if not pdf_bytes:
        return {"success": False, "error": "Empty PDF payload received", "tables": []}
    
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return {"success": False, "error": "PDF has 0 pages", "tables": []}
            
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
                    if any(c != "" for c in cleaned_row):
                        cleaned_rows.append(cleaned_row)
                return cleaned_rows

            def table_has_data_rows(tbl):
                if not tbl or len(tbl) < 2:
                    return False
                # Check if at least one row has a number (price)
                for row in tbl[1:]:
                    for cell in row:
                        val = re.sub(r'[^0-9.]', '', cell)
                        if val and len(val) > 0:
                            try:
                                if float(val) > 0:
                                    return True
                            except:
                                pass
                return False

            # Strategy 1: Explicit Table Grid (Default pdfplumber lines)
            raw_page0_tables = pdf.pages[0].extract_tables()
            if raw_page0_tables:
                for t in raw_page0_tables:
                    c = clean_table(t)
                    if table_has_data_rows(c):
                        cleaned_tables.append(c)

            # Check remaining pages if multi-page
            if page_count > 1:
                for p_idx in range(1, page_count):
                    page_tables = pdf.pages[p_idx].extract_tables()
                    if page_tables:
                        for t in page_tables:
                            c = clean_table(t)
                            if table_has_data_rows(c):
                                cleaned_tables.append(c)

            # Strategy 2: Text Strategy (Borderless tables aligned by text columns)
            if not cleaned_tables:
                for page in pdf.pages:
                    text_tables = page.extract_tables(table_settings={
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text",
                        "snap_tolerance": 5,
                        "join_tolerance": 5
                    })
                    if text_tables:
                        for t in text_tables:
                            c = clean_table(t)
                            if table_has_data_rows(c):
                                cleaned_tables.append(c)

            # Strategy 3: Layout Text Line Parser (100% deterministic for any wholesale price sheet)
            if not cleaned_tables:
                for page in pdf.pages:
                    txt = page.extract_text(layout=True) or page.extract_text()
                    if txt:
                        parsed_t = parse_text_lines_to_table(txt.splitlines())
                        if parsed_t and len(parsed_t) > 1:
                            cleaned_tables.append(parsed_t)

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

    if 'application/pdf' in content_type or body.startswith(b'%PDF'):
        return body

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
