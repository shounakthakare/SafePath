import os
import firebase_admin
from firebase_admin import credentials, firestore, storage
from dotenv import load_dotenv

load_dotenv()

# Firebase initialization
def init_firebase():
    # If already initialized, return
    if firebase_admin._apps:
        return firestore.client(), storage.bucket()

    try:
        # Option 1: Using service account file path from .env
        service_account_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if service_account_path and os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, {
                'storageBucket': os.environ.get("FIREBASE_STORAGE_BUCKET")
            })
        else:
            # Option 2: Using environment variables directly (useful for CI/CD)
            cert_info = {
                "type": "service_account",
                "project_id": os.environ.get("FIREBASE_PROJECT_ID"),
                "private_key_id": os.environ.get("FIREBASE_PRIVATE_KEY_ID"),
                "private_key": os.environ.get("FIREBASE_PRIVATE_KEY", "").replace('\\n', '\n'),
                "client_email": os.environ.get("FIREBASE_CLIENT_EMAIL"),
                "client_id": os.environ.get("FIREBASE_CLIENT_ID"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": os.environ.get("FIREBASE_CLIENT_X509_CERT_URL")
            }
            
            # check if all required fields are there for env strategy
            required = ["project_id", "private_key", "client_email"]
            if all(cert_info.get(k) for k in required):
                cred = credentials.Certificate(cert_info)
                firebase_admin.initialize_app(cred, {
                    'storageBucket': os.environ.get("FIREBASE_STORAGE_BUCKET")
                })
            else:
                print("Warning: Firebase credentials not fully configured in .env. Falling back to local only.")
                return None, None
                
        return firestore.client(), storage.bucket()
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        return None, None

db_firestore, storage_bucket = init_firebase()

def sync_alert_to_firebase(alert_data):
    """Saves an alert to Firestore for real-time reactivity."""
    if not db_firestore:
        return
    try:
        # Normalize data for JSON
        alert_copy = dict(alert_data)
        db_firestore.collection('alerts').document(str(alert_copy['id'])).set(alert_copy)
    except Exception as e:
        print(f"Error syncing alert to Firebase: {e}")

def sync_checkin_to_firebase(checkin_data):
    """Saves checkin data to Firestore."""
    if not db_firestore:
        return
    try:
        checkin_copy = dict(checkin_data)
        db_firestore.collection('checkins').document(str(checkin_copy.get('room_number'))).set(checkin_copy)
    except Exception as e:
        print(f"Error syncing checkin to Firebase: {e}")

def sync_staff_to_firebase(staff_data):
    """Saves staff data to Firestore."""
    if not db_firestore:
        return
    try:
        staff_copy = dict(staff_data)
        # We don't want to sync the PIN to the cloud directly if possible, or at least keep it secure
        # But for this system's staff console, we'll sync the ID, Name and Role.
        db_firestore.collection('staff').document(str(staff_copy.get('staff_id'))).set(staff_copy)
    except Exception as e:
        print(f"Error syncing staff to Firebase: {e}")

def delete_staff_from_firebase(staff_id):
    """Deletes staff data from Firestore."""
    if not db_firestore:
        return
    try:
        db_firestore.collection('staff').document(str(staff_id)).delete()
    except Exception as e:
        print(f"Error deleting staff from Firebase: {e}")

def upload_file_to_storage(file_path, destination_name):
    """Uploads a file to Firebase Storage."""
    if not storage_bucket:
        print("Firebase Storage not initialized.")
        return None
    try:
        blob = storage_bucket.blob(destination_name)
        blob.upload_from_filename(file_path)
        blob.make_public()
        return blob.public_url
    except Exception as e:
        print(f"Error uploading to storage: {e}")
        return None
