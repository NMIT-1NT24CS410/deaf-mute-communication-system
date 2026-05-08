import os
import cv2
import time
import json
import mediapipe as mp
import numpy as np
import tensorflow as tf
from flask import Flask, render_template, Response, request, jsonify

app = Flask(__name__)

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
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7, min_tracking_confidence=0.5)

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

def generate_frames():
    global current_prediction, confidence_score
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
            results = hands.process(img_rgb)

            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                                              mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                                              mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2, circle_radius=2))
                    
                    # Extract coordinates
                    features = normalize_landmarks(hand_landmarks)
                    features = np.array([features])
                    
                    # Predict
                    try:
                        preds = model.predict(features, verbose=0)[0]
                        class_idx = np.argmax(preds)
                        confidence_score = float(preds[class_idx])
                        
                        if confidence_score > 0.6:  # Threshold
                            current_prediction = str(class_names[class_idx])
                        else:
                            current_prediction = "?"
                    except Exception as e:
                        print(f"Prediction Error: {e}")

        # Encode frame to JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()
        
        # Yield as multipart
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

    cap.release()

@app.route('/')
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
    
    # Extract alphanumeric chars
    chars = [c for c in text if c.isalnum()]
    
    # We will return a list of character strings, frontend will map them to images or placeholders
    return jsonify({"chars": chars})

@app.route('/signs/<filename>')
def get_sign(filename):
    import os
    from flask import send_from_directory
    signs_dir = os.path.join(os.getcwd(), 'isl_signs')
    if not os.path.exists(signs_dir):
        os.makedirs(signs_dir)
    return send_from_directory(signs_dir, filename)

if __name__ == '__main__':

    app.run(debug=True, threaded=True)

# Trigger reload
