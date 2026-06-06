"""
STEP 4 - Real-Time ISL Detection (Sign -> Text -> Speech)
==========================================================
Uses webcam to detect hand gestures in real-time.
Predicts the ISL character using the trained Keras model.
Allows building words and speaking them out loud using TTS.

Controls:
  SPACE      - Add detected letter to current word
  ENTER      - Speak the word aloud
  BACKSPACE  - Delete last letter
  C          - Clear current word
  Q          - Quit
"""

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
import pyttsx3
import os

MODEL_DIR = "model"
MODEL_H5 = os.path.join(MODEL_DIR, "isl_model.h5")
LABEL_ENCODER = os.path.join(MODEL_DIR, "label_encoder.npy")

# Initialize TTS
engine = pyttsx3.init()
engine.setProperty('rate', 140)

def speak(text):
    if text.strip():
        engine.say(text)
        engine.runAndWait()

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

def main():
    if not os.path.exists(MODEL_H5) or not os.path.exists(LABEL_ENCODER):
        print(f"[ERROR] Trained model not found in '{MODEL_DIR}/'.")
        print("Please run step 1, 2, and 3 first to train the model.")
        return

    print("=" * 50)
    print("  Real-Time ISL Sign -> Text & Speech")
    print("=" * 50)

    # Load Model & Labels
    print("[INFO] Loading Model...")
    model = tf.keras.models.load_model(MODEL_H5)
    class_names = np.load(LABEL_ENCODER, allow_pickle=True)

    # Initialize MediaPipe
    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.5, min_tracking_confidence=0.5)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        return

    current_word = ""
    current_prediction = ""
    confidence = 0.0

    print("[INFO] Webcam active. Press 'Q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        h, w, c = frame.shape
        
        # Process Hand Landmarks
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(img_rgb)

        if not hasattr(main, "stable_frames"):
            main.stable_frames = 0
            main.no_hands_frames = 0
            main.last_prediction = "?"

        if results.multi_hand_landmarks:
            main.no_hands_frames = 0
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                
            # Extract coordinates
            features = extract_two_hands(results)
            features = np.array([features], dtype=np.float32)
            
            # Predict
            preds = model(features, training=False).numpy()[0]
            class_idx = np.argmax(preds)
            confidence = preds[class_idx]
            
            if confidence > 0.6:  # Threshold
                current_prediction = class_names[class_idx]
            else:
                current_prediction = "?"
                
            # Auto-form word logic
            if current_prediction != "?":
                if current_prediction == main.last_prediction:
                    main.stable_frames += 1
                    if main.stable_frames == 7: # Held for 7 frames (faster response)
                        if len(current_prediction) > 1:
                            if current_word and not current_word.endswith(" "):
                                current_word += " "
                            current_word += current_prediction + " "
                        else:
                            current_word += current_prediction
                        print(f"[INFO] Auto-added -> {current_word}")
                else:
                    main.stable_frames = 0
                main.last_prediction = current_prediction
            else:
                main.stable_frames = 0
                main.last_prediction = "?"
        else:
            current_prediction = "?"
            main.stable_frames = 0
            main.no_hands_frames += 1
            if main.no_hands_frames == 30: # 30 frames without hands
                if len(current_word) > 0 and current_word[-1] != " ":
                    current_word += " "
                    print("[INFO] Auto-added space")

        # Overlay GUI elements
        # Top banner for current word
        cv2.rectangle(frame, (0, 0), (w, 60), (0, 0, 0), -1)
        cv2.putText(frame, f"Word: {current_word}", (20, 40), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        # Bottom left for current prediction
        cv2.rectangle(frame, (0, h - 80), (300, h), (0, 0, 0), -1)
        cv2.putText(frame, f"Sign: {current_prediction} ({confidence*100:.1f}%)", (20, h - 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        # Bottom right for controls info
        cv2.putText(frame, "SPACE:Add | ENTER:Speak | C:Clear | Q:Quit", (10, h - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("Sign to Speech", frame)

        # Handle Keyboard Controls
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == ord('Q'):
            break
        elif key == 32: # SPACE
            if current_prediction and current_prediction != "?":
                if len(current_prediction) > 1:
                    if current_word and not current_word.endswith(" "):
                        current_word += " "
                    current_word += current_prediction + " "
                else:
                    current_word += current_prediction
                print(f"[INFO] Added -> {current_word}")
        elif key == 13: # ENTER
            if current_word:
                print(f"[INFO] Speaking: {current_word}")
                speak(current_word)
                current_word = "" # Clear after speaking
        elif key == 8: # BACKSPACE
            if len(current_word) > 0:
                current_word = current_word[:-1]
        elif key == ord('c') or key == ord('C'):
            current_word = ""
            print("[INFO] Cleared word.")

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
