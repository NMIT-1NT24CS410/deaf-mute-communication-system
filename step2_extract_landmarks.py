"""
STEP 2 - Extract Hand Landmarks
=================================
Reads images from the 'dataset/' folder.
Uses MediaPipe to extract 21 hand landmarks (x, y coordinates).
Saves the data to 'landmarks.csv' for training.
"""

import os
import cv2
import mediapipe as mp
import pandas as pd
from tqdm import tqdm

DATASET_DIR = "dataset"
OUTPUT_CSV = "landmarks.csv"

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=True, max_num_hands=2, min_detection_confidence=0.5)

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
    if not os.path.exists(DATASET_DIR):
        print(f"[ERROR] '{DATASET_DIR}' folder not found. Please run step 1 first or download the Kaggle dataset.")
        return

    print("=" * 50)
    print("  Extracting Hand Landmarks")
    print("=" * 50)

    data = []
    
    # Get all subdirectories (classes)
    classes = [d for d in os.listdir(DATASET_DIR) if os.path.isdir(os.path.join(DATASET_DIR, d))]
    classes.sort()

    for class_name in classes:
        class_dir = os.path.join(DATASET_DIR, class_name)
        images = os.listdir(class_dir)
        
        print(f"Processing class: {class_name}...")
        for img_name in tqdm(images, leave=False):
            img_path = os.path.join(class_dir, img_name)
            img = cv2.imread(img_path)
            
            if img is None:
                continue

            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = hands.process(img_rgb)

            if results.multi_hand_landmarks:
                row = [class_name]
                row.extend(extract_two_hands(results))
                data.append(row)

    # Create DataFrame and save
    if not data:
        print("[WARNING] No hands detected in any images!")
        return

    # Column names: label, x0_L, y0_L ... x20_L, y20_L, x0_R, y0_R ... x20_R, y20_R
    columns = ['label']
    for i in range(21):
        columns.extend([f'x{i}_L', f'y{i}_L'])
    for i in range(21):
        columns.extend([f'x{i}_R', f'y{i}_R'])

    df = pd.DataFrame(data, columns=columns)
    df.to_csv(OUTPUT_CSV, index=False)
    
    print(f"\n[DONE] Saved {len(df)} rows -> '{OUTPUT_CSV}'")

if __name__ == "__main__":
    main()
