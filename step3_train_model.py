"""
STEP 3 - Train the Model
=================================
Loads 'landmarks.csv'.
Trains a Neural Network using Keras.
Saves the trained model, label encoder, and TFLite version to the 'model/' folder.
"""

import os
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import matplotlib.pyplot as plt

INPUT_CSV = "landmarks.csv"
MODEL_DIR = "model"
MODEL_H5 = os.path.join(MODEL_DIR, "isl_model.h5")
LABEL_ENCODER = os.path.join(MODEL_DIR, "label_encoder.npy")
MODEL_TFLITE = os.path.join(MODEL_DIR, "isl_model.tflite")
HISTORY_PLOT = os.path.join(MODEL_DIR, "training_history.png")

def main():
    if not os.path.exists(INPUT_CSV):
        print(f"[ERROR] '{INPUT_CSV}' not found. Please run step 2 first.")
        return

    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 50)
    print("  Training Neural Network Model")
    print("=" * 50)

    # 1. Load Data
    print(f"[INFO] Loading data from '{INPUT_CSV}'...")
    df = pd.read_csv(INPUT_CSV)
    
    X = df.drop('label', axis=1).values
    y_raw = df['label'].values

    # 2. Encode Labels
    le = LabelEncoder()
    y_encoded = le.fit_transform(y_raw)
    num_classes = len(le.classes_)
    
    np.save(LABEL_ENCODER, le.classes_)
    print(f"[INFO] Found {num_classes} classes: {le.classes_}")

    # 3. Train/Test Split
    X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded)
    
    print(f"[INFO] Training samples: {len(X_train)}")
    print(f"[INFO] Testing samples: {len(X_test)}")

    # 4. Build Model
    model = tf.keras.models.Sequential([
        tf.keras.layers.Input(shape=(42,)),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(num_classes, activation='softmax')
    ])

    model.compile(optimizer='adam',
                  loss='sparse_categorical_crossentropy',
                  metrics=['accuracy'])

    # 5. Train Model
    print("\n[INFO] Starting training...")
    history = model.fit(
        X_train, y_train,
        epochs=50,
        batch_size=32,
        validation_data=(X_test, y_test)
    )

    # 6. Evaluate
    loss, acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"\n[INFO] Final Test Accuracy: {acc*100:.2f}%")

    # 7. Save Models
    model.save(MODEL_H5)
    print(f"[INFO] Keras model saved -> {MODEL_H5}")

    # Convert to TFLite
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()
    with open(MODEL_TFLITE, 'wb') as f:
        f.write(tflite_model)
    print(f"[INFO] TFLite model saved -> {MODEL_TFLITE}")

    # 8. Plot History
    plt.figure(figsize=(10, 4))
    plt.subplot(1, 2, 1)
    plt.plot(history.history['accuracy'], label='Train Acc')
    plt.plot(history.history['val_accuracy'], label='Val Acc')
    plt.title('Accuracy')
    plt.legend()
    
    plt.subplot(1, 2, 2)
    plt.plot(history.history['loss'], label='Train Loss')
    plt.plot(history.history['val_loss'], label='Val Loss')
    plt.title('Loss')
    plt.legend()
    
    plt.savefig(HISTORY_PLOT)
    print(f"[INFO] Training history plot saved -> {HISTORY_PLOT}")
    print("\n[DONE] Model training complete!")

if __name__ == "__main__":
    main()
