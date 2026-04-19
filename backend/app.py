# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
from datetime import datetime
import os
import uuid

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'safepath.db')


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS rooms (
                room_number INTEGER PRIMARY KEY,
                floor       INTEGER NOT NULL,
                status      TEXT    NOT NULL DEFAULT 'available'
            );

            CREATE TABLE IF NOT EXISTS checkins (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_name          TEXT    NOT NULL,
                room_number         INTEGER NOT NULL,
                floor               INTEGER NOT NULL,
                language            TEXT    NOT NULL DEFAULT 'English',
                email               TEXT    NOT NULL DEFAULT '',
                mobile              TEXT    NOT NULL DEFAULT '',
                qr_token            TEXT    UNIQUE,
                checkin_datetime    TEXT    NOT NULL,
                checkout_datetime   TEXT,
                status              TEXT    NOT NULL DEFAULT 'active',
                FOREIGN KEY (room_number) REFERENCES rooms(room_number)
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_name          TEXT    NOT NULL,
                room_number         INTEGER NOT NULL,
                floor               INTEGER NOT NULL,
                severity            INTEGER NOT NULL,
                message             TEXT    NOT NULL,
                timestamp           TEXT    NOT NULL,
                status              TEXT    NOT NULL DEFAULT 'active'
            );

            CREATE TABLE IF NOT EXISTS broadcasts (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                target              TEXT    NOT NULL,
                message             TEXT    NOT NULL,
                timestamp           TEXT    NOT NULL
            );
        ''')
        # Seed 10 rooms per floor
        for floor in [1, 2, 3]:
            for i in range(1, 11):
                num = floor * 100 + i
                conn.execute(
                    'INSERT OR IGNORE INTO rooms (room_number, floor) VALUES (?, ?)',
                    (num, floor)
                )
        conn.commit()


def migrate_db():
    """Safely add new columns to existing DB if they're missing."""
    with get_db() as conn:
        cols = [row[1] for row in conn.execute('PRAGMA table_info(checkins)')]
        if 'email' not in cols:
            conn.execute('ALTER TABLE checkins ADD COLUMN email TEXT NOT NULL DEFAULT ""')
        if 'mobile' not in cols:
            conn.execute('ALTER TABLE checkins ADD COLUMN mobile TEXT NOT NULL DEFAULT ""')
        if 'qr_token' not in cols:
            conn.execute('ALTER TABLE checkins ADD COLUMN qr_token TEXT')
        
        conn.execute('CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, guest_name TEXT NOT NULL, room_number INTEGER NOT NULL, floor INTEGER NOT NULL, severity INTEGER NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT NOT NULL DEFAULT "active")')
        conn.execute('CREATE TABLE IF NOT EXISTS broadcasts (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, message TEXT NOT NULL, timestamp TEXT NOT NULL)')
        conn.commit()


# ─── Rooms ────────────────────────────────────────────────────────────────────

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    with get_db() as conn:
        rows = conn.execute('''
            SELECT r.room_number, r.floor, r.status,
                   c.guest_name, c.language, c.checkin_datetime
            FROM rooms r
            LEFT JOIN checkins c
                ON r.room_number = c.room_number AND c.status = 'active'
            ORDER BY r.room_number
        ''').fetchall()
    return jsonify([dict(r) for r in rows])


# ─── Staff: Register Guest & Generate QR ─────────────────────────────────────

@app.route('/api/register-guest', methods=['POST'])
def register_guest():
    data = request.get_json(force=True)
    name        = str(data.get('name', '')).strip()
    room_number = int(data.get('roomNumber', 0))
    language    = str(data.get('language', 'English'))
    email       = str(data.get('email', '')).strip()
    mobile      = str(data.get('mobile', '')).strip()

    if not name:
        return jsonify({'error': 'Guest name is required'}), 400
    if room_number <= 0:
        return jsonify({'error': 'Invalid room number'}), 400
    if not email:
        return jsonify({'error': 'Guest email is required'}), 400
    if not mobile:
        return jsonify({'error': 'Guest mobile number is required'}), 400

    with get_db() as conn:
        room = conn.execute(
            'SELECT * FROM rooms WHERE room_number = ?', (room_number,)
        ).fetchone()
        if not room:
            return jsonify({'error': f'Room {room_number} does not exist'}), 404

        occupied = conn.execute(
            'SELECT guest_name FROM checkins WHERE room_number = ? AND status = "active"',
            (room_number,)
        ).fetchone()
        if occupied:
            return jsonify({
                'error': f'Room {room_number} is already occupied by {occupied["guest_name"]}. Please choose another room.'
            }), 409

        token = str(uuid.uuid4())
        now   = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')

        conn.execute('''
            INSERT INTO checkins
                (guest_name, room_number, floor, language, email, mobile, qr_token, checkin_datetime, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ''', (name, room_number, room['floor'], language, email, mobile, token, now))
        conn.execute(
            'UPDATE rooms SET status = "occupied" WHERE room_number = ?', (room_number,)
        )
        conn.commit()
        
    base_url = request.headers.get('Origin', 'http://localhost:5173')
    send_checkin_notifications(name, room_number, base_url, token, email, mobile)

    return jsonify({
        'success': True,
        'token': token,
        'guest': {
            'name':             name,
            'roomNumber':       room_number,
            'floor':            room['floor'],
            'language':         language,
            'email':            email,
            'mobile':           mobile,
            'checkinDatetime':  now,
        }
    }), 201


# ─── Guest: Verify QR Token ───────────────────────────────────────────────────

@app.route('/api/guest-by-token/<token>', methods=['GET'])
def guest_by_token(token):
    with get_db() as conn:
        row = conn.execute('''
            SELECT c.id, c.guest_name, c.room_number, c.floor, c.language,
                   c.email, c.mobile, c.checkin_datetime, c.qr_token
            FROM checkins c
            WHERE c.qr_token = ? AND c.status = 'active'
        ''', (token,)).fetchone()

    if not row:
        return jsonify({'error': 'Invalid or expired QR code. Please ask staff to re-register.'}), 404

    return jsonify(dict(row))


# ─── Staff: Check-out ─────────────────────────────────────────────────────────

@app.route('/api/checkout', methods=['POST'])
def checkout():
    data = request.get_json(force=True)
    room_number = int(data.get('roomNumber', 0))

    with get_db() as conn:
        checkin_rec = conn.execute(
            'SELECT id, guest_name FROM checkins WHERE room_number = ? AND status = "active"',
            (room_number,)
        ).fetchone()
        if not checkin_rec:
            return jsonify({'error': f'No active check-in found for Room {room_number}'}), 404

        now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        conn.execute(
            'UPDATE checkins SET status = "checked_out", checkout_datetime = ? WHERE id = ?',
            (now, checkin_rec['id'])
        )
        conn.execute(
            'UPDATE rooms SET status = "available" WHERE room_number = ?', (room_number,)
        )
        conn.commit()

    return jsonify({
        'success': True,
        'message': f'Room {room_number} — {checkin_rec["guest_name"]} checked out at {now}'
    })


# ─── Guests list ──────────────────────────────────────────────────────────────

@app.route('/api/guests', methods=['GET'])
def get_guests():
    status_filter = request.args.get('status', 'active')
    with get_db() as conn:
        if status_filter == 'all':
            rows = conn.execute('''
                SELECT id, guest_name, room_number, floor, language,
                       email, mobile, checkin_datetime, checkout_datetime, status
                FROM checkins ORDER BY checkin_datetime DESC
            ''').fetchall()
        else:
            rows = conn.execute('''
                SELECT id, guest_name, room_number, floor, language,
                       email, mobile, checkin_datetime, checkout_datetime, status
                FROM checkins WHERE status = ? ORDER BY checkin_datetime DESC
            ''', (status_filter,)).fetchall()
    return jsonify([dict(r) for r in rows])


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.route('/api/stats', methods=['GET'])
def get_stats():
    with get_db() as conn:
        total    = conn.execute('SELECT COUNT(*) as c FROM rooms').fetchone()['c']
        occupied = conn.execute(
            'SELECT COUNT(*) as c FROM rooms WHERE status = "occupied"'
        ).fetchone()['c']
        by_floor = conn.execute('''
            SELECT floor,
                   COUNT(*) as total,
                   SUM(CASE WHEN status="occupied" THEN 1 ELSE 0 END) as occupied
            FROM rooms GROUP BY floor ORDER BY floor
        ''').fetchall()
    return jsonify({
        'total': total, 'occupied': occupied, 'available': total - occupied,
        'byFloor': [dict(r) for r in by_floor]
    })

# ─── Alerts ───────────────────────────────────────────────────────────────────

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM alerts ORDER BY timestamp DESC').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/alerts', methods=['POST'])
def create_alert():
    data = request.get_json(force=True)
    guest_name = str(data.get('guestName', 'Unknown'))
    room_number = int(data.get('roomNumber', 0))
    floor = int(data.get('floor', 0))
    severity = int(data.get('severity', 1))
    message = str(data.get('message', ''))
    
    now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    
    with get_db() as conn:
        cursor = conn.execute(
            'INSERT INTO alerts (guest_name, room_number, floor, severity, message, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, "active")',
            (guest_name, room_number, floor, severity, message, now)
        )
        alert_id = cursor.lastrowid
        conn.commit()
    
    return jsonify({'success': True, 'id': alert_id}), 201

@app.route('/api/alerts/<int:alert_id>/acknowledge', methods=['POST'])
def acknowledge_alert(alert_id):
    with get_db() as conn:
        conn.execute('UPDATE alerts SET status = "acknowledged" WHERE id = ?', (alert_id,))
        conn.commit()
    return jsonify({'success': True})

# ─── Broadcasts ───────────────────────────────────────────────────────────────

@app.route('/api/broadcasts', methods=['GET'])
def get_broadcasts():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM broadcasts ORDER BY timestamp DESC').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/broadcasts', methods=['POST'])
def create_broadcast():
    data = request.get_json(force=True)
    target = str(data.get('target', 'all'))
    message = str(data.get('message', ''))
    now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    
    with get_db() as conn:
        conn.execute(
            'INSERT INTO broadcasts (target, message, timestamp) VALUES (?, ?, ?)',
            (target, message, now)
        )
        conn.commit()
    return jsonify({'success': True}), 201

@app.route('/api/broadcasts/<int:broadcast_id>', methods=['DELETE'])
def delete_broadcast(broadcast_id):
    with get_db() as conn:
        conn.execute('DELETE FROM broadcasts WHERE id = ?', (broadcast_id,))
        conn.commit()
    return jsonify({'success': True})

@app.route('/api/broadcasts', methods=['DELETE'])
def clear_all_broadcasts():
    with get_db() as conn:
        conn.execute('DELETE FROM broadcasts')
        conn.commit()
    return jsonify({'success': True})

@app.route('/api/clear-trials', methods=['DELETE'])
def clear_trials():
    with get_db() as conn:
        conn.execute('DELETE FROM broadcasts')
        conn.execute('DELETE FROM checkins')
        conn.execute('DELETE FROM alerts')
        conn.execute('UPDATE rooms SET status = "available"')
        conn.commit()
    return jsonify({'success': True, 'message': 'All trial data cleared'})

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
import threading
import io

def send_checkin_notifications(guest_name, room, base_url, token, email, mobile):
    login_url = f"{base_url}/guest-login?token={token}"

    def send_real_email():
        my_email = "raghavw2006@gmail.com"
        my_app_password = "unzk mzpe zqsm rjxj".replace(" ", "")

        msg = MIMEMultipart('related')
        msg['From'] = my_email
        msg['To'] = email
        msg['Subject'] = f"Welcome to SafePath Hospitality - Room {room}"

        html_body = f"""
        <html><body style="font-family:Arial,sans-serif;background:#0a0e1a;color:#fff;padding:0;margin:0;">
          <div style="max-width:600px;margin:auto;background:#101827;border-radius:16px;overflow:hidden;">
            <img src="cid:hotel_banner" alt="Azure Oasis Hotel" style="width:100%;height:220px;object-fit:cover;">
            <div style="padding:32px;">
              <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Welcome, {guest_name}!</h1>
              <p style="color:#a0aec0;font-size:16px;margin:0 0 24px;">
                You are now checked in to <b style="color:#fff;">Room {room}</b>.<br>
                Your personalised emergency exit guide is ready below.
              </p>
              <div style="text-align:center;background:#1c2a40;border-radius:12px;padding:24px;margin:20px 0;">
                <p style="color:#e2e8f0;margin:0 0 16px;">Scan this QR code to access your live safety dashboard:</p>
                <img src="cid:qr_code" alt="QR Code" style="width:200px;height:200px;border-radius:8px;">
                <p style="color:#718096;font-size:12px;margin:12px 0 0;">
                  Or visit: <a href="{login_url}" style="color:#d4a843;">{login_url}</a>
                </p>
              </div>
              <p style="color:#718096;font-size:13px;border-top:1px solid #2d3748;padding-top:16px;margin-top:24px;">
                In an emergency, always follow staff instructions.<br>
                <b style="color:#d4a843;">SafePath AI</b> - Intelligent Emergency Management
              </p>
            </div>
          </div>
        </body></html>
        """
        msg.attach(MIMEText(html_body, 'html'))

        # Attach hotel banner
        hotel_img_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'hotel-bg.jpg')
        try:
            with open(hotel_img_path, 'rb') as f:
                hotel_img = MIMEImage(f.read(), _subtype='jpeg')
                hotel_img.add_header('Content-ID', '<hotel_banner>')
                hotel_img.add_header('Content-Disposition', 'inline', filename='hotel.jpg')
                msg.attach(hotel_img)
        except Exception as e:
            print(f"Warning: Could not attach hotel image: {e}")

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
            print(f"[OK] Email with hotel image + QR sent to: {email}", flush=True)
        except Exception as e:
            print(f"[ERROR] Failed to send email: {e}", flush=True)

    if email:
        threading.Thread(target=send_real_email, daemon=True).start()

    print(f"[SMS] Simulated SMS to: {mobile}", flush=True)
    print(f"SafePath: Welcome {guest_name}! Access your live guide: {login_url}", flush=True)
    print("=" * 50, flush=True)


if __name__ == '__main__':
    init_db()
    migrate_db()
    print('SafePath backend: http://localhost:5000')
    app.run(debug=True, port=5000)
