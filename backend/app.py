# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
import os
import uuid
from deep_translator import GoogleTranslator
import google.generativeai as genai
from dotenv import load_dotenv
from supabase_helper import select, select_one, insert, upsert, update, delete, init_db

load_dotenv()

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

app = Flask(__name__)
CORS(app)

from email_templates import EMAIL_TEMPLATE
# ─── Rooms ────────────────────────────────────────────────────────────────────
@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    try:
        rooms = select("rooms", {"order": "room_number.asc"})
        return jsonify(rooms)
    except Exception as e:
        print(f"Error fetching rooms: {e}")
        return jsonify([])


# ─── Staff: Register Guest & Generate QR ─────────────────────────────────────

@app.route('/api/register-guest', methods=['POST'])
def register_guest():
    data = request.get_json(force=True)
    name         = str(data.get('name', '')).strip()
    room_number  = int(data.get('roomNumber', 0))
    language     = str(data.get('language', 'English'))
    email        = str(data.get('email', '')).strip()
    mobile       = str(data.get('mobile', '')).strip()
    guests_count = int(data.get('guestsCount', 1))

    if not name or not email or not mobile or room_number <= 0:
        return jsonify({'error': 'All fields are required.'}), 400

    try:
        room = select_one("rooms", {"room_number": f"eq.{room_number}"})
        if not room:
            return jsonify({'error': f'Room {room_number} does not exist'}), 404

        if room.get('status') == 'occupied':
            return jsonify({'error': 'Room is already occupied'}), 409

        token = str(uuid.uuid4())
        now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

        checkin_data = {
            'id': token,
            'guest_name': name,
            'room_number': room_number,
            'floor': room['floor'],
            'language': language,
            'email': email,
            'mobile': mobile,
            'qr_token': token,
            'checkin_datetime': now,
            'status': 'active'
        }
        insert("checkins", checkin_data)

        # Update room status
        update("rooms", {"room_number": f"eq.{room_number}"}, {
            'status': 'occupied',
            'guest_name': name,
            'language': language,
            'checkin_datetime': now
        })

        base_url = request.headers.get('Origin', 'http://localhost:5173')
        send_checkin_notifications(name, room_number, base_url, token, email, mobile)

        return jsonify({'success': True, 'token': token, 'guest': checkin_data}), 201
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── Guest: Verify QR Token ───────────────────────────────────────────────────

@app.route('/api/guest-by-token/<token>', methods=['GET'])
def guest_by_token(token):
    try:
        guest = select_one("checkins", {"id": f"eq.{token}"})
        if not guest:
            return jsonify({'error': 'Invalid or expired QR code.'}), 404
        return jsonify(guest)
    except Exception as e:
        return jsonify({'error': str(e)}), 503


# ─── Staff: Check-out ─────────────────────────────────────────────────────────

@app.route('/api/checkout', methods=['POST'])
def checkout():
    data = request.get_json(force=True)
    room_number = int(data.get('roomNumber', 0))
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    try:
        checkin = select_one("checkins", {
            "room_number": f"eq.{room_number}",
            "status": "eq.active"
        })

        if not checkin:
            return jsonify({'error': 'No active guest found for this room'}), 404

        # Update checkin
        update("checkins", {"id": f"eq.{checkin['id']}"}, {
            'status': 'checked_out',
            'checkout_datetime': now
        })

        # Reset room
        update("rooms", {"room_number": f"eq.{room_number}"}, {
            'status': 'available',
            'guest_name': None,
            'language': None,
            'checkin_datetime': None
        })

        return jsonify({'success': True, 'message': 'Checked out successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── Guests list ──────────────────────────────────────────────────────────────

@app.route('/api/guests', methods=['GET'])
def get_guests():
    status_filter = request.args.get('status', 'active')
    try:
        params = {"order": "checkin_datetime.desc"}
        if status_filter != 'all':
            params["status"] = f"eq.{status_filter}"
        return jsonify(select("checkins", params))
    except Exception as e:
        print(f"Error fetching guests: {e}")
        return jsonify([])

@app.route('/api/guests/history', methods=['DELETE'])
def clear_guest_history():
    try:
        deleted = delete("checkins", {"status": "eq.checked_out"})
        return jsonify({'success': True, 'count': len(deleted)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─── Stats ────────────────────────────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        rooms = select("rooms")
        occupied = sum(1 for r in rooms if r.get('status') == 'occupied')

        floors = {}
        for r in rooms:
            f = r['floor']
            if f not in floors: floors[f] = {'floor': f, 'total': 0, 'occupied': 0}
            floors[f]['total'] += 1
            if r.get('status') == 'occupied':
                floors[f]['occupied'] += 1

        return jsonify({
            'total': len(rooms),
            'occupied': occupied,
            'available': len(rooms) - occupied,
            'byFloor': sorted(floors.values(), key=lambda x: x['floor'])
        })
    except Exception as e:
        print(f"Stats error: {e}")
        return jsonify({'total': 0, 'occupied': 0, 'available': 0, 'byFloor': []})


# ─── Alerts ───────────────────────────────────────────────────────────────────

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    try:
        return jsonify(select("alerts", {"order": "timestamp.desc", "limit": 50}))
    except Exception:
        return jsonify([])

@app.route('/api/alerts', methods=['POST'])
def create_alert():
    data = request.get_json(force=True)
    guest_name = str(data.get('guestName', 'Unknown'))
    room_number = int(data.get('roomNumber', 0))
    floor = int(data.get('floor', 0))
    message = str(data.get('message', ''))
    severity = 1
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    alert_id = str(uuid.uuid4())

    alert_data = {
        'id': alert_id,
        'guest_name': guest_name,
        'room_number': room_number,
        'floor': floor,
        'severity': severity,
        'message': message,
        'timestamp': now,
        'status': 'active'
    }
    try:
        upsert("alerts", alert_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # ASYNC Gemini Severity Check
    if GEMINI_KEY:
        def analyze_severity_async(aid, msg):
            try:
                model = genai.GenerativeModel('gemini-flash-latest')
                prompt = f"Analyze emergency message and return exactly one number 1-5. Message: '{msg}'"
                resp = model.generate_content(prompt)
                import re
                m = re.search(r'[1-5]', resp.text)
                if m:
                    update("alerts", {"id": f"eq.{aid}"}, {'severity': int(m.group(0))})
            except: pass

        import threading
        threading.Thread(target=analyze_severity_async, args=(alert_id, message)).start()

    return jsonify({'success': True, 'id': alert_id, 'severity': severity}), 201

@app.route('/api/alerts/resolved', methods=['DELETE'])
def clear_resolved_alerts():
    try:
        deleted = delete("alerts", {"status": "eq.acknowledged"})
        return jsonify({'success': True, 'count': len(deleted)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/alerts/<alert_id>', methods=['PATCH'])
def update_alert(alert_id):
    data = request.get_json(force=True)
    severity = data.get('severity')
    status = data.get('status')

    updates = {}
    if severity is not None: updates['severity'] = int(severity)
    if status is not None:   updates['status'] = status

    if updates:
        try:
            update("alerts", {"id": f"eq.{alert_id}"}, updates)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return jsonify({'success': True})

@app.route('/api/alerts/resolve-by-room', methods=['POST'])
def resolve_alerts_by_room():
    data = request.get_json(force=True)
    room_number = int(data.get('roomNumber', 0))
    try:
        update("alerts", {
            "room_number": f"eq.{room_number}",
            "status": "eq.active"
        }, {'status': 'acknowledged'})
    except Exception as e:
        print(f"Supabase resolve error: {e}")
    return jsonify({'success': True})


# ─── Broadcasts ───────────────────────────────────────────────────────────────

@app.route('/api/broadcasts', methods=['GET'])
def get_broadcasts():
    lang = request.args.get('language')
    try:
        broadcasts = select("broadcasts", {"order": "timestamp.desc", "limit": 20})
    except:
        return jsonify([])

    lang_map = {
        'English': 'en', 'Hindi': 'hi', 'Spanish': 'es', 'French': 'fr',
        'Arabic': 'ar', 'German': 'de', 'Chinese': 'zh-CN', 'Japanese': 'ja',
        'Russian': 'ru', 'Portuguese': 'pt'
    }
    target_lang = lang_map.get(lang, lang.lower()) if lang else 'en'

    if target_lang != 'en' and broadcasts:
        try:
            translator = GoogleTranslator(source='auto', target=target_lang)
            for idx, b in enumerate(broadcasts):
                try:
                    broadcasts[idx]['message'] = translator.translate(b['message'])
                except: pass
        except: pass

    return jsonify(broadcasts)

@app.route('/api/ai/suggest-broadcast', methods=['GET'])
def ai_suggest_broadcast():
    target = request.args.get('target', 'all')
    if GEMINI_KEY:
        try:
            model = genai.GenerativeModel('gemini-flash-latest')
            prompt = f"Write a single sentence emergency broadcast announcement to guests in {target}. Keep it extremely concise, professional, and clear."
            resp = model.generate_content(prompt)
            suggestion = resp.text.strip().replace('"', '')
            return jsonify({'suggestion': suggestion})
        except Exception as e:
            print(f"Broadcast AI Error: {e}")
    return jsonify({'suggestion': f"Attention {target} guests. Please remain calm and proceed to the nearest emergency exit."})

@app.route('/api/broadcasts', methods=['POST'])
def create_broadcast():
    data = request.get_json(force=True)
    target = str(data.get('target', 'all'))
    message = str(data.get('message', ''))
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    b_id = str(uuid.uuid4())
    b_data = {'id': b_id, 'target': target, 'message': message, 'timestamp': now}
    try:
        insert("broadcasts", b_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'success': True}), 201

@app.route('/api/broadcasts/<broadcast_id>', methods=['DELETE'])
def delete_broadcast(broadcast_id):
    try:
        delete("broadcasts", {"id": f"eq.{broadcast_id}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'success': True})

@app.route('/api/broadcasts', methods=['DELETE'])
def clear_all_broadcasts():
    try:
        # Delete all broadcasts — 'not.is.null' matches every row that has an ID
        delete("broadcasts", {"id": "not.is.null"})
    except Exception as e:
        print(f"Clear broadcasts error: {e}")
        return jsonify({'error': str(e)}), 500
    return jsonify({'success': True})

@app.route('/api/clear-trials', methods=['DELETE'])
def clear_trials():
    try:
        delete("broadcasts", {"id": "not.is.null"})
        delete("alerts", {"id": "not.is.null"})
        delete("checkins", {"id": "not.is.null"})
        delete("danger_zones", {"room_id": "not.is.null"})

        # Reset all rooms
        rooms = select("rooms")
        for r in rooms:
            update("rooms", {"room_number": f"eq.{r['room_number']}"}, {
                'status': 'available',
                'guest_name': None,
                'language': None,
                'checkin_datetime': None
            })
    except Exception as e:
        print(f"Error clearing Supabase: {e}")

    return jsonify({'success': True, 'message': 'All cloud data cleared.'})


# ─── Staff Management ─────────────────────────────────────────────────────────

@app.route('/api/staff/login', methods=['POST'])
def login_staff():
    data = request.get_json(force=True)
    staff_id = str(data.get('staff_id', '')).strip()
    pin = str(data.get('pin', '')).strip()

    staff = select_one("staff", {"staff_id": f"eq.{staff_id}"})
    if not staff:
        return jsonify({'error': 'Invalid Staff ID'}), 401

    if str(staff.get('pin')) != pin:
        return jsonify({'error': 'Invalid PIN'}), 401

    return jsonify({'success': True, 'staff': staff})

@app.route('/api/staff', methods=['GET'])
def get_staff_list():
    try:
        return jsonify(select("staff"))
    except:
        return jsonify([])

@app.route('/api/staff', methods=['POST'])
def add_staff():
    data = request.get_json(force=True)
    sid = str(data.get('staff_id', '')).strip()
    name = str(data.get('name', '')).strip()
    pin = str(data.get('pin', '')).strip()
    role = str(data.get('role', 'staff')).strip()

    try:
        upsert("staff", {'staff_id': sid, 'name': name, 'pin': pin, 'role': role})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'success': True}), 201

@app.route('/api/staff/<staff_id>', methods=['DELETE'])
def delete_staff(staff_id):
    if staff_id == 'admin': return jsonify({'error': 'Cannot delete admin'}), 403
    try:
        delete("staff", {"staff_id": f"eq.{staff_id}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'success': True})

@app.route('/api/resend-email', methods=['POST'])
def resend_email():
    data = request.get_json(force=True)
    room_number = int(data.get('roomNumber', 0))

    try:
        guest = select_one("checkins", {
            "room_number": f"eq.{room_number}",
            "status": "eq.active"
        })

        if not guest:
            return jsonify({'error': 'No active resident found for this unit'}), 404

        base_url = request.headers.get('Origin', 'http://localhost:5173')
        send_checkin_notifications(
            guest['guest_name'],
            guest['room_number'],
            base_url,
            guest['qr_token'],
            guest['email'],
            guest.get('mobile', '')
        )
        return jsonify({'success': True, 'message': 'Email resent successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─── Danger Zones API (for frontend real-time) ───────────────────────────────

@app.route('/api/danger-zones', methods=['GET'])
def get_danger_zones():
    try:
        return jsonify(select("danger_zones"))
    except:
        return jsonify([])

@app.route('/api/danger-zones', methods=['POST'])
def upsert_danger_zone():
    data = request.get_json(force=True)
    room_id = str(data.get('roomId', ''))
    level = str(data.get('level', 'warning'))
    try:
        upsert("danger_zones", {"room_id": room_id, "level": level})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/danger-zones/<room_id>', methods=['DELETE'])
def delete_danger_zone(room_id):
    try:
        delete("danger_zones", {"room_id": f"eq.{room_id}"})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/danger-zones', methods=['DELETE'])
def clear_all_danger_zones():
    try:
        delete("danger_zones", {"room_id": "neq."})
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import threading
import io

def send_checkin_notifications(guest_name, room, base_url, token, email, mobile):
    login_url = f"{base_url}/guest-login?token={token}"

    def send_real_email():
        my_email = os.environ.get("GMAIL_USER", "raghavw2006@gmail.com")
        my_app_password = os.environ.get("GMAIL_APP_PASSWORD", "unzk mzpe zqsm rjxj").replace(" ", "")

        msg = MIMEMultipart('related')
        msg['From'] = my_email
        msg['To'] = email
        msg['Subject'] = f"Secure Access: SafePath Hospital Safety Guide - Unit {room}"

        html_body = EMAIL_TEMPLATE.format(
            guest_name=guest_name,
            room=room,
            login_url=login_url
        )
        msg.attach(MIMEText(html_body, 'html'))

        # Attach facility banner
        facility_img_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'facility-bg.jpg')
        try:
            with open(facility_img_path, 'rb') as f:
                facility_img = MIMEImage(f.read(), _subtype='jpeg')
                facility_img.add_header('Content-ID', '<facility_banner>')
                facility_img.add_header('Content-Disposition', 'inline', filename='facility.jpg')
                msg.attach(facility_img)
        except Exception as e:
            print(f"Warning: Could not attach facility image: {e}")

        # Generate and attach QR code
        try:
            import qrcode
            qr = qrcode.QRCode(version=2, box_size=10, border=2)
            qr.add_data(login_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="#0a0e1a", back_color="white")
            buf = io.BytesIO()
            qr_img.save(buf, format='PNG')
            buf.seek(0)
            qr_mime = MIMEImage(buf.read(), _subtype='png')
            qr_mime.add_header('Content-ID', '<qr_code>')
            qr_mime.add_header('Content-Disposition', 'inline', filename='qr_code.png')
            msg.attach(qr_mime)
        except Exception as e:
            print(f"Warning: Could not generate QR code: {e}")

        try:
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(my_email, my_app_password)
            server.send_message(msg)
            server.quit()
            print(f"[OK] Email with facility image + QR sent to: {email}", flush=True)
        except Exception as e:
            print(f"[ERROR] Failed to send email: {e}", flush=True)

    if email:
        threading.Thread(target=send_real_email, daemon=True).start()

    print(f"[NOTIFICATION] Check-in processed for {guest_name} (Unit {room}). SMS feature disabled by request.", flush=True)
    print("=" * 50, flush=True)


if __name__ == '__main__':
    init_db()
    print('SafePath Cloud Backend (Supabase): http://0.0.0.0:5000')
    app.run(debug=True, port=5000, host='0.0.0.0')
