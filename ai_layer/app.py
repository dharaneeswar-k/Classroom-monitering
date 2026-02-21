from flask import Flask, request, jsonify, Response
import requests
import threading
import time
import os
import urllib.request
import cv2
import numpy as np
import face_recognition
import mediapipe as mp
import math
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BACKEND_BASE_URL = "http://localhost:5000/api"
SYNC_URL = f"{BACKEND_BASE_URL}/ai/sync"
EVENT_URL = f"{BACKEND_BASE_URL}/ai/events"
ABSENT_URL = f"{BACKEND_BASE_URL}/ai/absent"

KNOWN_FACES_DIR = "known_faces"
os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

# MediaPipe Setup
mp_face_mesh = mp.solutions.face_mesh
# NOTE: FaceMesh is NOT thread-safe. Each camera thread creates its own instance.

global_state = {
    "students": [],
    "classrooms": [],
    "cameras": [],
    "known_encodings": {},
    "known_names": {},
    "mocking_active": False,
    "current_session": None,
    "unseen_timers": {},
    "presence_start": {},
    "session_start_time": None,
    "recent_detections": [],
    "camera_streams": {},  # { cam_id: cv2.VideoCapture }
    "latest_frames": {},   # { cam_id: frame }
    "raw_frames": {},      # { cam_id: frame }
    "ai_boxes": {},        # { cam_id: list of boxes }
    "active_cam_threads": set()  # Set of cam_ids currently running threads
}

def get_id_from_field(field):
    """Safely extract string _id from a field that may be an object dict or a plain string."""
    if isinstance(field, dict):
        return field.get("_id", "")
    return str(field) if field else ""

def sync_backend_data():
    print("[INIT] Syncing with Backend Authority...")
    try:
        res = requests.get(SYNC_URL)
        res.raise_for_status()
        data = res.json()
        
        global_state["students"] = data.get("students", [])
        global_state["classrooms"] = data.get("classrooms", [])
        global_state["cameras"] = data.get("cameras", [])
        
        for student in global_state["students"]:
            sid = student.get("_id")
            image_url = student.get("imageUrl")
            name = student.get('userId', {}).get('name', 'Unknown')
            
            global_state["known_names"][sid] = name
            
            if image_url:
                filename = os.path.join(KNOWN_FACES_DIR, f"{sid}.jpg")
                if not os.path.exists(filename):
                    print(f"Downloading face for {name}...")
                    try:
                        urllib.request.urlretrieve(image_url, filename)
                    except:
                        continue
                
                try:
                    img = face_recognition.load_image_file(filename)
                    encodings = face_recognition.face_encodings(img)
                    if len(encodings) > 0:
                        global_state["known_encodings"][sid] = encodings[0]
                        print(f"[INIT] Successfully registered face for {name}")
                except Exception as e:
                    print(f"Error encoding {filename}: {e}")
                    
        print(f"[INIT] Sync Complete! {len(global_state['known_encodings'])} faces registered. Ready for Real-Time CV.")
    except Exception as e:
        print(f"[INIT ERROR] Could not sync with backend: {e}")

sync_backend_data()

def calc_distance(p1, p2):
    return math.hypot(p2.x - p1.x, p2.y - p1.y)


def camera_capture_thread(cam_info):
    """Dedicated thread for fetching frames from a specific camera"""
    cam_id = cam_info["_id"]
    source = cam_info["streamUrl"]
    
    # If source is '0' or '1' etc, convert to int for webcam
    if source.isdigit():
        source = int(source)
        
    cap = cv2.VideoCapture(source)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    print(f"[CAM] Started capture for {cam_info['name']} ({cam_id})")
    
    while global_state["mocking_active"]:
        success, frame = cap.read()
        if not success:
            time.sleep(0.01)
            continue
            
        global_state["raw_frames"][cam_id] = frame.copy()
        
        # Live session info overlay
        session = global_state.get("current_session")
        if session:
            elapsed = int(time.time() - global_state.get("session_start_time", time.time()))
            mins, secs = divmod(elapsed, 60)
            cv2.putText(frame, f"{cam_info['name']} | LIVE | {mins:02d}:{secs:02d}", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 100), 2)
        else:
            cv2.putText(frame, f"{cam_info['name']} - NO SESSION", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 100, 0), 2)
        
        # Draw AI Boxes for THIS camera
        for b in global_state["ai_boxes"].get(cam_id, []):
            top, right, bottom, left = b["box"]
            cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
            cv2.putText(frame, b["name"], (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
        # Draw recent detections (Global)
        y_offset = 70
        current_time = time.time()
        for d in reversed(global_state.get("recent_detections", [])):
            if current_time - d["time"] < 6:
                name = global_state["known_names"].get(d["student"], "Unknown")
                active = [k for k, v in d["signals"].items() if v]
                if active:
                    cv2.putText(frame, f"{name}: {','.join(active)}", (20, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 80, 255), 2)
                    y_offset += 25

        global_state["latest_frames"][cam_id] = frame
        
    cap.release()
    print(f"[CAM] Camera Thread Stopped for {cam_id}")


def ai_processing_thread(cam_info):
    """Runs heavy deep learning separately so the camera feed doesn't lag.
       Each thread owns its own FaceMesh instance for thread-safety.
    """
    cam_id = cam_info["_id"]
    last_event_times = {}
    
    # Create a per-thread FaceMesh — MediaPipe is NOT thread-safe
    local_face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=5, refine_landmarks=True,
        min_detection_confidence=0.5, min_tracking_confidence=0.5
    )
    
    print(f"[AI] Started processing for {cam_info['name']} ({cam_id})")
    
    while global_state["mocking_active"]:
        frame = global_state["raw_frames"].get(cam_id)
        if frame is None:
            time.sleep(0.1)
            continue
            
        session = global_state["current_session"]
        if not session or not session.get("students"):
            time.sleep(0.1)
            continue
            
        current_time = time.time()
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # 1. Face Recognition
        small_frame = cv2.resize(rgb_frame, (0, 0), fx=0.5, fy=0.5)
        face_locations = face_recognition.face_locations(small_frame, model="hog")
        face_encodings = face_recognition.face_encodings(small_frame, face_locations)
        
        detected_students = []
        new_boxes = []
        for face_encoding, face_loc in zip(face_encodings, face_locations):
            top, right, bottom, left = [coord * 2 for coord in face_loc]
            
            matches = face_recognition.compare_faces(list(global_state["known_encodings"].values()), face_encoding, tolerance=0.50)
            student_id = None
            
            if True in matches:
                first_match_index = matches.index(True)
                student_id = list(global_state["known_encodings"].keys())[first_match_index]
                if student_id in session["students"]:
                    detected_students.append(student_id)
                    global_state["unseen_timers"][student_id] = current_time  # Reset absent timer
 
                    # Track first-seen time for participation 60% rule
                    if student_id not in global_state["presence_start"]:
                        global_state["presence_start"][student_id] = current_time
                        print(f"[AI] First detection for {global_state['known_names'].get(student_id)} on {cam_info['name']}")
            
            name_display = global_state['known_names'].get(student_id, "Unknown!") if student_id else "Unknown"
            new_boxes.append({"box": (top, right, bottom, left), "name": name_display})
            
        global_state["ai_boxes"][cam_id] = new_boxes
            
        # 2. Check 30s absent rule (Global check, but we only run it from ONE thread to avoid duplication)
        # We'll use the first camera in the session list as the 'authority' for absent marking
        authority_cam_id = session.get("authority_camera_id")
        if cam_id == authority_cam_id:
            for sid in session["students"]:
                last_seen = global_state["unseen_timers"].get(sid, current_time)
                if current_time - last_seen > 30:
                    print(f"[AI] Student {global_state['known_names'].get(sid)} missing 30s! Marking absent.")
                    try:
                        requests.post(ABSENT_URL, json={"studentId": sid, "classSessionId": session["classSessionId"]}, timeout=3)
                    except:
                        pass
                    global_state["unseen_timers"][sid] = current_time  # Don't spam
                
        # 3. MediaPipe Behavior tracking (process primary student detected on THIS camera)
        results = local_face_mesh.process(rgb_frame)
        if results.multi_face_landmarks and len(detected_students) > 0:
            primary_student = detected_students[0]
            
            for face_landmarks in results.multi_face_landmarks:
                leye_v = calc_distance(face_landmarks.landmark[159], face_landmarks.landmark[145])
                leye_h = calc_distance(face_landmarks.landmark[33], face_landmarks.landmark[133])
                ear = leye_v / (leye_h + 1e-6)
                is_sleeping = ear < 0.20
                
                mouth_v = calc_distance(face_landmarks.landmark[13], face_landmarks.landmark[14])
                mouth_h = calc_distance(face_landmarks.landmark[78], face_landmarks.landmark[308])
                mar = mouth_v / (mouth_h + 1e-6)
                is_yawning = mar > 0.6
                
                is_laughing = (mar > 0.2 and mar < 0.5) and (mouth_h > calc_distance(face_landmarks.landmark[33], face_landmarks.landmark[263]) * 0.45)
                
                nose = face_landmarks.landmark[1]
                left_cheek = face_landmarks.landmark[234]
                right_cheek = face_landmarks.landmark[454]
                dist_l = calc_distance(nose, left_cheek)
                dist_r = calc_distance(nose, right_cheek)
                ratio = dist_l / (dist_r + 1e-6)
                is_looking_away = ratio > 2.0 or ratio < 0.5
                
                top_head = face_landmarks.landmark[10]
                chin = face_landmarks.landmark[152]
                nose_bridge = face_landmarks.landmark[168]
                upper_face_len = calc_distance(top_head, nose_bridge)
                lower_face_len = calc_distance(nose_bridge, chin)
                pitch_ratio = lower_face_len / (upper_face_len + 1e-6)
                
                # If chin is closer to nose than top head is to nose, user is looking down at a phone
                is_phone = pitch_ratio < 0.8
                
                signals = {
                    "sleeping": is_sleeping,
                    "yawning": is_yawning,
                    "laughing": is_laughing,
                    "phone_usage": is_phone,
                    "looking_away": is_looking_away
                }
                
                has_violation = any(signals.values())
                
                last_event = last_event_times.get(primary_student, 0)
                if current_time - last_event > 5:
                    last_event_times[primary_student] = current_time
                    try:
                        requests.post(EVENT_URL, json={
                            "studentId": primary_student,
                            "cameraId": cam_id,
                            "classSessionId": session["classSessionId"],
                            "signals": signals
                        }, timeout=3)
                    except Exception:
                        pass
                    
                    if has_violation:
                        global_state["recent_detections"].append({
                            "student": primary_student,
                            "time": current_time,
                            "signals": signals
                        })
                        global_state["recent_detections"] = global_state["recent_detections"][-5:]

        time.sleep(0.05)
        
    local_face_mesh.close()
    global_state["active_cam_threads"].discard(cam_id)
    print(f"[AI] DL Processing Thread Stopped for {cam_id}")

def generate_video_stream(cam_id):
    while True:
        frame = global_state["latest_frames"].get(cam_id)
        if frame is None:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, f"Waiting for {cam_id}...", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        time.sleep(0.033)  # ~30fps cap

@app.route('/video_feed')
def video_feed():
    cam_id = request.args.get("cameraId")
    if not cam_id:
        # Fallback to first available or error
        cam_id = next(iter(global_state["latest_frames"].keys()), "None")
    return Response(generate_video_stream(cam_id), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/start-mocking', methods=['POST'])
def start_mocking():
    # Always fetch latest data from backend before starting a session
    sync_backend_data()
    
    data = request.json
    classroomId = data.get("classroomId")
    classSessionId = data.get("classSessionId")
    if not classroomId:
        return jsonify({"error": "Missing classroomId"}), 400
    if not classSessionId:
        return jsonify({"error": "Missing classSessionId"}), 400

    # 1. Find ALL cameras for this classroom
    classroom_cameras = []
    for c in global_state["cameras"]:
        cam_classroom_id = get_id_from_field(c.get("classroomId", ""))
        if cam_classroom_id == classroomId:
            classroom_cameras.append(c)
    
    if not classroom_cameras:
        print(f"[WARN] No cameras found for classroom {classroomId}. Using fallback.")
        classroom_cameras = [{"_id": "Camera-Fallback", "name": "Fallback Cam", "streamUrl": "0"}]

    # 2. Find all students in this classroom
    students_in_class = []
    for s in global_state["students"]:
        student_id = s.get("_id")
        student_classroom_id = get_id_from_field(s.get("classroomId", ""))
        if student_classroom_id == classroomId:
            students_in_class.append(student_id)

    print(f"[SESSION] Starting for classroom {classroomId}: {len(students_in_class)} students, {len(classroom_cameras)} cameras")
    
    global_state["current_session"] = {
        "classSessionId": classSessionId,
        "classroomId": classroomId,
        "authority_camera_id": classroom_cameras[0]["_id"],
        "students": students_in_class,
        "active_cameras": classroom_cameras
    }
    global_state["session_start_time"] = time.time()
    global_state["presence_start"] = {}
    
    # Initialize unseen timers
    t = time.time()
    for sid in students_in_class:
        global_state["unseen_timers"][sid] = t
    
    global_state["mocking_active"] = True
    
    # Start threads for any camera that isn't already running
    new_threads = 0
    for cam in classroom_cameras:
        cam_id = cam["_id"]
        if cam_id not in global_state["active_cam_threads"]:
            global_state["active_cam_threads"].add(cam_id)
            threading.Thread(target=camera_capture_thread, args=(cam,), daemon=True).start()
            threading.Thread(target=ai_processing_thread, args=(cam,), daemon=True).start()
            new_threads += 1
    print(f"[SESSION] AI Multi-Camera threads started. ({new_threads} new pairs, {len(classroom_cameras)} total cameras)")
        
    return jsonify({
        "message": "CV Active", 
        "tracked": len(students_in_class), 
        "cameras": [{"id": c["_id"], "name": c["name"]} for c in classroom_cameras]
    })

@app.route('/stop-mocking', methods=['POST'])
def stop_mocking():
    global_state["mocking_active"] = False
    global_state["current_session"] = None
    global_state["session_start_time"] = None
    global_state["presence_start"] = {}
    global_state["latest_frames"] = {}
    global_state["raw_frames"] = {}
    global_state["ai_boxes"] = {}
    global_state["active_cam_threads"] = set()
    print("[SESSION] Mocking stopped.")
    return jsonify({"message": "Stopped"})

@app.route('/status', methods=['GET'])
def status():
    session = global_state.get("current_session")
    elapsed = 0
    if session and global_state.get("session_start_time"):
        elapsed = int(time.time() - global_state["session_start_time"])
    return jsonify({
        "active": global_state["mocking_active"],
        "session": session,
        "elapsedSeconds": elapsed,
        "knownFaces": len(global_state["known_encodings"])
    })

@app.route('/resync', methods=['POST'])
def resync():
    """Force re-sync of face data from backend (call when new students are added)"""
    sync_backend_data()
    return jsonify({"message": "Resync complete", "faces": len(global_state["known_encodings"])})

if __name__ == '__main__':
    app.run(port=5001, debug=True, use_reloader=False)
