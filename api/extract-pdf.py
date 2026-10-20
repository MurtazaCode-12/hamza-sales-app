import sys
import io
import json
import base64
import re
from http.server import BaseHTTPRequestHandler
import pdfplumber

def group_words_by_baseline(words, y_tolerance=3.0):
    """
    Groups words by baseline y-coordinate (w['bottom']) within a specified tolerance (+-3px).
    Sorts lines top-to-bottom and words left-to-right by x0.
    """
    if not words:
        return []
        
    sorted_words = sorted(words, key=lambda w: (float(w['bottom']), float(w['x0'])))
    lines = []
    
    for w in sorted_words:
        y = float(w['bottom'])
        matched_line = None
        for line in lines:
            if abs(y - line['bottom']) <= y_tolerance:
                matched_line = line
                break
        if matched_line:
            matched_line['words'].append(w)
            n = len(matched_line['words'])
            matched_line['bottom'] = ((n - 1) * matched_line['bottom'] + y) / n
        else:
            lines.append({'bottom': y, 'words': [w]})
            
    lines.sort(key=lambda l: l['bottom'])
    for l in lines:
        l['words'].sort(key=lambda w: float(w['x0']))
        
    return lines

def extract_products_from_coordinate_lines(lines):
    """
    Parses horizontal coordinate lines into structured items:
    - Product / Variant Title: text tokens on the left/middle
    - Rate: numerical value matching regex \d+(\.\d{2})? at maximum x-coordinate (far right)
    """
    items = []
    
    for l in lines:
        l_words = l['words']
        if len(l_words) < 2:
            continue
            
        rate_val = None
        rate_idx = -1
        unit_val = 'Pcs'
        
        for i in range(len(l_words) - 1, -1, -1):
            w_text = l_words[i]['text'].strip()
            if i == len(l_words) - 1 and w_text.lower() in ['pcs', 'box', 'set', 'dozen', 'kg', 'pkt', 'packet', 'pair', 'mtr', '/-']:
                if w_text != '/-':
                    unit_val = w_text.capitalize()
                continue
                
            clean_token = re.sub(r'^(?:(?:Rs\.?|INR|₹|@)\s*)?', '', w_text, flags=re.I)
            clean_token = re.sub(r'(?:/-)?$', '', clean_token).replace(',', '')
            
            m = re.match(r'^\d+(?:\.\d{1,2})?$', clean_token)
            if m:
                try:
                    val = float(clean_token)
                    if val > 0:
                        rate_val = val
                        rate_idx = i
                        break
                except:
                    pass
                    
        if rate_val is None or rate_idx <= 0:
            continue
            
        effective_end = rate_idx
        while effective_end > 0 and l_words[effective_end - 1]['text'].strip().lower() in ['rs', 'rs.', 'inr', '₹', '@']:
            effective_end -= 1
            
        if effective_end <= 0:
            continue
            
        left_words = l_words[:effective_end]
        raw_title = " ".join(w['text'] for w in left_words).strip(" -:•\t,")
        
        lower_title = raw_title.lower()
        if any(lower_title.startswith(k) for k in ['total', 'subtotal', 'date', 'page ', 'terms', 'condition', 'phone', 'email', 'gst', 'invoice']):
            continue
        if re.search(r'\b(product\s*name|rate\s*list|price\s*list|particulars)\b', lower_title):
            continue
            
        full_line_text = " ".join(w['text'] for w in l_words).strip()
        sub_matches = list(re.finditer(
            r'([a-zA-Z0-9/x.\s\(\)]+?)\s+(?:(?:Rs\.?|INR|₹)\s*)?(\d+(?:\.\d{1,2})?)(?:\s*(?:Pcs|Box|/-))?(?:\s*[,;|]\s*|\s+|$)',
            full_line_text,
            re.I
        ))
        
        if len(sub_matches) >= 2 and all(float(m.group(2)) > 0 for m in sub_matches):
            first_text = sub_matches[0].group(1).strip(" -:•\t,")
            base_prod = first_text
            var0 = ""
            vm = re.search(r'\b(standard|heavy|deluxe|antic|brass|black|\d+\s*(?:mm|inch|in)|\d+\s*x\s*[\d/]+(?:\s*x\s*[\d/]+)?)\b.*$', first_text, re.I)
            if vm and vm.start() > 0:
                base_prod = first_text[:vm.start()].strip(" -:•\t,")
                var0 = first_text[vm.start():].strip(" -:•\t,")
                
            items.append({
                "product_name": base_prod,
                "variant": var0,
                "rate": float(sub_matches[0].group(2)),
                "unit": "Pcs"
            })
            for sm in sub_matches[1:]:
                v_part = sm.group(1).strip(" -:•\t,")
                v_part = re.sub(r'^(?:Rs\.?|INR|₹|@)\s*', '', v_part, flags=re.I).strip()
                items.append({
                    "product_name": base_prod,
                    "variant": v_part,
                    "rate": float(sm.group(2)),
                    "unit": "Pcs"
                })
            continue

        variant = ""
        product_name = raw_title
        
        vm = re.search(r'\b(standard|heavy|deluxe|antic|brass|black|\d+\s*(?:mm|inch|in)|\d+\s*x\s*[\d/]+(?:\s*x\s*[\d/]+)?)\b.*$', raw_title, re.I)
        if vm and vm.start() > 0:
            product_name = raw_title[:vm.start()].strip(" -:•\t,")
            variant = raw_title[vm.start():].strip(" -:•\t,")
            variant = re.sub(r'\s*(?:Rs\.?|INR|₹|@)$', '', variant, flags=re.I).strip()
            
        items.append({
            "product_name": product_name,
            "variant": variant,
            "rate": rate_val,
            "unit": unit_val
        })
        
    return items

def render_page_images(pdf, max_pages=5):
    """
    Renders base64 JPEG images of PDF pages for multimodal Gemini fallback.
    """
    images = []
    try:
        from PIL import Image
        for i in range(min(len(pdf.pages), max_pages)):
            page = pdf.pages[i]
            img_buf = io.BytesIO()
            p_img = page.to_image(resolution=120).original.convert('RGB')
            p_img.save(img_buf, format='JPEG', quality=80)
            b64 = base64.b64encode(img_buf.getvalue()).decode('utf-8')
            images.append(b64)
    except Exception as e:
        print(f"Warning: page image rendering failed: {e}", file=sys.stderr)
    return images

def parse_tables_from_pdf_bytes(pdf_bytes: bytes) -> dict:
    if not pdf_bytes:
        return {"success": False, "error": "Empty PDF payload received", "tables": [], "items": []}
    
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return {"success": False, "error": "PDF has 0 pages", "tables": [], "items": []}
            
            # STRATEGY 1 (PRIMARY): Coordinate-Based Spatial Word Extraction
            all_coordinate_items = []
            
            for page in pdf.pages:
                words = page.extract_words(keep_blank_chars=False)
                if words:
                    grouped_lines = group_words_by_baseline(words, y_tolerance=3.0)
                    page_items = extract_products_from_coordinate_lines(grouped_lines)
                    all_coordinate_items.extend(page_items)
                    
            if len(all_coordinate_items) >= 3:
                table_rows = [["Product Name", "Size / Variant", "Rate", "Unit"]]
                for it in all_coordinate_items:
                    table_rows.append([
                        it["product_name"],
                        it.get("variant", ""),
                        str(it["rate"]),
                        it.get("unit", "Pcs")
                    ])
                    
                return {
                    "success": True,
                    "strategy": "coordinate",
                    "productCount": len(all_coordinate_items),
                    "items": all_coordinate_items,
                    "tables": [table_rows],
                    "pageCount": page_count,
                    "totalTables": 1
                }

            # STRATEGY 2: Explicit Table Lines (Fallback)
            def clean_table(raw_table):
                if not raw_table:
                    return []
                cleaned_rows = []
                for row in raw_table:
                    if not row:
                        continue
                    cleaned_row = [(str(cell).strip() if cell is not None else "") for cell in row]
                    if any(c != "" for c in cleaned_row):
                        cleaned_rows.append(cleaned_row)
                return cleaned_rows

            def table_has_data_rows(tbl):
                if not tbl or len(tbl) < 2:
                    return False
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

            cleaned_tables = []
            for page in pdf.pages:
                raw_tables = page.extract_tables()
                if raw_tables:
                    for t in raw_tables:
                        c = clean_table(t)
                        if table_has_data_rows(c):
                            cleaned_tables.append(c)

            if cleaned_tables:
                return {
                    "success": True,
                    "strategy": "table_lines",
                    "productCount": sum(len(t) - 1 for t in cleaned_tables),
                    "items": all_coordinate_items,
                    "tables": cleaned_tables,
                    "pageCount": page_count,
                    "totalTables": len(cleaned_tables)
                }

            # FEWER THAN 3 PRODUCTS: Prepare Multimodal Fallback Payload
            page_images = render_page_images(pdf, max_pages=5)
            
            return {
                "success": True,
                "strategy": "insufficient_coordinate_rows",
                "productCount": len(all_coordinate_items),
                "items": all_coordinate_items,
                "pageImages": page_images,
                "tables": [],
                "pageCount": page_count,
                "totalTables": 0
            }

    except Exception as e:
        return {"success": False, "error": str(e), "tables": [], "items": []}

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
            sep_crlf = b'\r\n\r\n'
            sep_lf = b'\n\n'
            for part in parts:
                if b'filename=' in part or b'name="file"' in part or b'%PDF' in part:
                    if sep_crlf in part:
                        file_data = part.split(sep_crlf, 1)[1]
                    elif sep_lf in part:
                        file_data = part.split(sep_lf, 1)[1]
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
        self.wfile.write(json.dumps({"status": "ready", "service": "coordinate-pdf-extractor"}).encode('utf-8'))

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
