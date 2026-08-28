import os
import cv2
import time
import json
import base64
import threading
import mediapipe as mp
import numpy as np
import tensorflow as tf
from flask import Flask, render_template, Response, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")
mediapipe_lock = threading.Lock()

# Constants and Global State
MODEL_DIR = "model"
MODEL_H5 = os.path.join(MODEL_DIR, "isl_model.h5")
LABEL_ENCODER = os.path.join(MODEL_DIR, "label_encoder.npy")

current_word = ""
current_prediction = "?"
confidence_score = 0.0

# Load Model
print("[INFO] Loading Model...")
try:
    model = tf.keras.models.load_model(MODEL_H5)
    class_names = np.load(LABEL_ENCODER, allow_pickle=True)
    model_loaded = True
except Exception as e:
    print(f"[ERROR] Could not load model: {e}")
    model_loaded = False
    model = None
    class_names = []

# Initialize MediaPipe
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)

def normalize_landmarks(hand_landmarks):
    # Extract relative coordinates relative to wrist (landmark 0)
    base_x, base_y = hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y
    rel_coords = []
    
    for landmark in hand_landmarks.landmark:
        rel_coords.append([landmark.x - base_x, landmark.y - base_y])
    
    # Normalize by max distance to make scale invariant
    flat_coords = [abs(val) for pair in rel_coords for val in pair]
    max_val = max(flat_coords) if max(flat_coords) > 0 else 1.0
    
    normalized = []
    for pair in rel_coords:
        normalized.extend([pair[0] / max_val, pair[1] / max_val])
        
    return normalized

def extract_two_hands(results):
    left_features = [0.0] * 42
    right_features = [0.0] * 42
    
    if results.multi_hand_landmarks and results.multi_handedness:
        for hand_landmarks, handedness in zip(results.multi_hand_landmarks, results.multi_handedness):
            features = normalize_landmarks(hand_landmarks)
            label = handedness.classification[0].label
            if label == 'Left':
                left_features = features
            else:
                right_features = features
                
    return left_features + right_features

def generate_frames():
    global current_word, current_prediction, confidence_score
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        return

    while True:
        success, frame = cap.read()
        if not success:
            break
            
        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape
        
        # Process Hand Landmarks
        if model_loaded:
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            with mediapipe_lock:
                results = hands.process(img_rgb)

            if not hasattr(generate_frames, "stable_frames"):
                generate_frames.stable_frames = 0
                generate_frames.no_hands_frames = 0
                generate_frames.last_prediction = "?"

            if results.multi_hand_landmarks:
                generate_frames.no_hands_frames = 0
                for hand_landmarks in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                                              mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                                              mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2))
                    
                # Extract coordinates
                features = extract_two_hands(results)
                features = np.array([features], dtype=np.float32)
                
                # Predict
                try:
                    preds = model(features, training=False).numpy()[0]
                    class_idx = np.argmax(preds)
                    confidence_score = float(preds[class_idx])
                    
                    if confidence_score > 0.55:  # Threshold
                        current_prediction = str(class_names[class_idx])
                    else:
                        current_prediction = "?"
                        
                    # Auto-form word logic (Stabilization)
                    if current_prediction != "?":
                        if current_prediction == generate_frames.last_prediction:
                            generate_frames.stable_frames += 1
                            if generate_frames.stable_frames == 7: # Held for 7 frames (faster response)
                                if len(current_prediction) > 1:
                                    if current_word and not current_word.endswith(" "):
                                        current_word += " "
                                    current_word += current_prediction + " "
                                else:
                                    current_word += current_prediction
                        else:
                            generate_frames.stable_frames = 0
                        generate_frames.last_prediction = current_prediction
                    else:
                        generate_frames.stable_frames = 0
                        generate_frames.last_prediction = "?"

                except Exception as e:
                    print(f"Prediction Error: {e}")
            else:
                current_prediction = "?"
                generate_frames.stable_frames = 0
                generate_frames.no_hands_frames += 1
                if generate_frames.no_hands_frames == 30: # 30 frames without hands
                    if len(current_word) > 0 and current_word[-1] != " ":
                        current_word += " "

        # Encode frame to JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        
        # Yield as multipart
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

    cap.release()

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/dashboard')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/state')
def get_state():
    global current_word, current_prediction, confidence_score
    return jsonify({
        "current_word": current_word,
        "current_prediction": current_prediction,
        "confidence": confidence_score
    })

@app.route('/action', methods=['POST'])
def handle_action():
    global current_word, current_prediction
    data = request.json
    action = data.get('action')
    
    if action == 'add':
        if current_prediction and current_prediction != "?":
            if len(current_prediction) > 1:
                if current_word and not current_word.endswith(" "):
                    current_word += " "
                current_word += current_prediction + " "
            else:
                current_word += current_prediction
    elif action == 'backspace':
        if len(current_word) > 0:
            current_word = current_word[:-1]
    elif action == 'clear':
        current_word = ""
    elif action == 'speak':
        # We will return the current word and clear it, allowing frontend to speak
        word_to_speak = current_word
        current_word = ""
        return jsonify({"status": "success", "word": word_to_speak})
        
    return jsonify({"status": "success", "current_word": current_word})

@app.route('/text_to_sign', methods=['POST'])
def text_to_sign():
    data = request.json
    text = data.get('text', '').upper().strip()
    
    words = text.split()
    steps = []
    signs_dir = os.path.join(os.getcwd(), 'isl_signs')
    for word in words:
        # Check if there is an image for the full word
        word_found_in_signs = False
        for ext in [".jpg", ".jpeg", ".png"]:
            if os.path.exists(os.path.join(signs_dir, word + ext)):
                word_found_in_signs = True
                break
                
        if word_found_in_signs:
            steps.append({
                "type": "word",
                "label": word,
                "frames": [f"/signs/{word}.jpg"]
            })
        else:
            # Check if there's a folder in dataset
            dataset_word_dir = os.path.join(os.getcwd(), 'dataset', word)
            if os.path.isdir(dataset_word_dir) and os.listdir(dataset_word_dir):
                files = [f for f in os.listdir(dataset_word_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
                if files:
                    # Sort files numerically
                    def extract_number(filename):
                        try:
                            return int(os.path.splitext(filename)[0])
                        except ValueError:
                            return filename
                    files.sort(key=extract_number)
                    
                    # Downsample to 25 frames
                    num_frames = 25
                    if len(files) > num_frames:
                        indices = np.linspace(0, len(files) - 1, num_frames, dtype=int)
                        selected_files = [files[idx] for idx in indices]
                    else:
                        selected_files = files
                        
                    frames = [f"/dataset_signs/{word}/{f}" for f in selected_files]
                    steps.append({
                        "type": "word",
                        "label": word,
                        "frames": frames
                    })
                    continue
            
            # Fallback to character spelling
            for char in word:
                if char.isalnum():
                    steps.append({
                        "type": "char",
                        "label": char,
                        "frames": [f"/signs/{char}.jpg"]
                    })
                    
    return jsonify({"steps": steps})

@app.route('/dataset_signs/<word>/<filename>')
def get_dataset_sign(word, filename):
    import os
    from flask import send_from_directory
    dataset_word_dir = os.path.join(os.getcwd(), 'dataset', word)
    return send_from_directory(dataset_word_dir, filename)

@app.route('/signs/<filename>')
def get_sign(filename):
    import os
    from flask import send_from_directory
    signs_dir = os.path.join(os.getcwd(), 'isl_signs')
    if not os.path.exists(signs_dir):
        os.makedirs(signs_dir)
        
    # Check if file exists in signs_dir
    file_path = os.path.join(signs_dir, filename)
    if os.path.exists(file_path):
        return send_from_directory(signs_dir, filename)
        
    # If not found, check if it's a word-level sign in the dataset directory
    word, ext = os.path.splitext(filename)
    dataset_word_dir = os.path.join(os.getcwd(), 'dataset', word)
    if os.path.exists(dataset_word_dir) and os.path.isdir(dataset_word_dir):
        files = [f for f in os.listdir(dataset_word_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if files:
            # Return the middle image (usually a stable representation of the gesture)
            files.sort()
            middle_file = files[len(files) // 2]
            return send_from_directory(dataset_word_dir, middle_file)
            
    # Default fallback
    return send_from_directory(signs_dir, filename)

def perform_prediction(image_data):
    global model, class_names, model_loaded
    if not model_loaded or model is None:
        return {"prediction": "?", "confidence": 0.0, "error": "Model not loaded"}
        
    try:
        header, encoded = image_data.split(",", 1)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return {"prediction": "?", "confidence": 0.0, "error": "Failed to decode image"}
            
        prediction = "?"
        confidence = 0.0
        results = None
        
        with mediapipe_lock:
            # 1. Try with flipped frame first (matches laptop webcam dataset)
            flipped_frame = cv2.flip(frame, 1)
            img_rgb_flipped = cv2.cvtColor(flipped_frame, cv2.COLOR_BGR2RGB)
            results = hands.process(img_rgb_flipped)
            
            if results.multi_hand_landmarks:
                features = extract_two_hands(results)
                features = np.array([features], dtype=np.float32)
                preds = model(features, training=False).numpy()[0]
                class_idx = np.argmax(preds)
                confidence = float(preds[class_idx])
                if confidence > 0.55:
                    prediction = str(class_names[class_idx])
            
            # 2. Try with raw unflipped frame if confidence is low (for some phone cameras)
            # CRITICAL OPTIMIZATION: Only process unflipped if a hand was actually detected.
            # If no hands are found in the flipped image, none will be found in the unflipped image.
            if (prediction == "?" or confidence < 0.55) and results and results.multi_hand_landmarks:
                img_rgb_raw = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results_raw = hands.process(img_rgb_raw)
                if results_raw.multi_hand_landmarks:
                    features = extract_two_hands(results_raw)
                    features = np.array([features], dtype=np.float32)
                    preds = model(features, training=False).numpy()[0]
                    class_idx = np.argmax(preds)
                    raw_confidence = float(preds[class_idx])
                    if raw_confidence > confidence and raw_confidence > 0.55:
                        confidence = raw_confidence
                        prediction = str(class_names[class_idx])
                        results = results_raw

        # Console logging for diagnostics
        if results and getattr(results, 'multi_hand_landmarks', None):
            print(f"[PREDICT] Hands: {len(results.multi_hand_landmarks)} | Gesture: {prediction} ({confidence*100:.1f}%)")
        else:
            print("[PREDICT] No hands detected in frame.")
                
        return {
            "prediction": prediction,
            "confidence": confidence
        }
    except Exception as e:
        print(f"Prediction logic error: {e}")
        return {"prediction": "?", "confidence": 0.0, "error": str(e)}

@app.route('/predict', methods=['POST'])
def predict_gesture():
    data = request.json
    image_data = data.get('image')
    if not image_data:
        return jsonify({"prediction": "?", "confidence": 0.0, "error": "No image data"})
    res = perform_prediction(image_data)
    return jsonify(res)

@socketio.on('predict-frame')
def handle_predict_frame(data):
    image_data = data.get('image')
    if not image_data:
        return {"prediction": "?", "confidence": 0.0, "error": "No image data"}
    return perform_prediction(image_data)

# Socket.IO Event Handlers
@socketio.on('join')
def on_join(data):
    room = data.get('room')
    name = data.get('name', 'User')
    join_room(room)
    print(f"[SOCKET] Client {request.sid} ({name}) joined room: {room}")
    emit('peer-joined', {"socketId": request.sid, "name": name}, room=room, include_self=False)

@socketio.on('signal')
def on_signal(data):
    room = data.get('room')
    emit('signal', data, room=room, include_self=False)

@socketio.on('chat-message')
def on_chat_message(data):
    room = data.get('room')
    emit('chat-message', data, room=room, include_self=False)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
