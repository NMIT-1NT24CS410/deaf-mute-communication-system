"""
STEP 5 - Text / Speech -> Sign Language Display (Module 2)
==========================================================
The hearing person types or speaks a word/sentence.
The app converts each letter to an ISL sign image and
displays them one by one on screen like a slideshow.

Requirements:
  * A folder 'isl_signs/' containing images named A.jpg, B.jpg ... Z.jpg, 1.jpg ... 9.jpg
    (You can collect these from your dataset or download from Kaggle ISL dataset)
  * OR the app will show a placeholder if image not found

Controls inside display window:
  N - next sign manually
  Q - quit display
"""

import cv2
import pyttsx3
import speech_recognition as sr
import os
import time
import numpy as np

# -- Config ------------------------------------------------------------------
SIGNS_DIR    = "isl_signs"   # folder with A.jpg, B.jpg, ... Z.jpg, 1.jpg...
DISPLAY_TIME = 1.5           # seconds per sign
WIN_W, WIN_H = 640, 480

# -- TTS ----------------------------------------------------------------------
engine = pyttsx3.init()
engine.setProperty("rate", 140)

def speak(text):
    engine.say(text)
    engine.runAndWait()


# -- Speech recognition -------------------------------------------------------
def listen_from_mic():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("[MIC] Adjusting for ambient noise ...")
        recognizer.adjust_for_ambient_noise(source, duration=1)
        print("[MIC] Listening ... speak now!")
        try:
            audio = recognizer.listen(source, timeout=6)
            text  = recognizer.recognize_google(audio)
            print(f"[MIC] Recognized: '{text}'")
            return text.upper()
        except sr.WaitTimeoutError:
            print("[MIC] No speech detected.")
            return ""
        except sr.UnrecognizedAudioError:
            print("[MIC] Could not understand audio.")
            return ""
        except sr.RequestError as e:
            print(f"[MIC] API error: {e}")
            return ""


# -- Sign image loader ---------------------------------------------------------
def load_sign_image(char):
    """Load sign image for a character or word, return placeholder if not found."""
    for ext in [".jpg", ".jpeg", ".png"]:
        path = os.path.join(SIGNS_DIR, char + ext)
        if os.path.exists(path):
            img = cv2.imread(path)
            if img is not None:
                return cv2.resize(img, (WIN_W, WIN_H))

    # Check dataset folder for word gestures
    dataset_word_dir = os.path.join("dataset", char)
    if os.path.exists(dataset_word_dir) and os.path.isdir(dataset_word_dir):
        files = [f for f in os.listdir(dataset_word_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        if files:
            files.sort()
            middle_file = files[len(files) // 2]
            path = os.path.join(dataset_word_dir, middle_file)
            img = cv2.imread(path)
            if img is not None:
                return cv2.resize(img, (WIN_W, WIN_H))

    # Placeholder: dark background with letter/word
    placeholder = np.zeros((WIN_H, WIN_W, 3), dtype=np.uint8)
    placeholder[:] = (30, 30, 50)
    
    font_scale = 2.5 if len(char) > 1 else 8
    thickness = 4 if len(char) > 1 else 12
    text_x = WIN_W//2 - 20 * len(char) if len(char) > 1 else WIN_W//2 - 80
    
    cv2.putText(placeholder, char, (text_x, WIN_H//2 + 40),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (100, 220, 255), thickness)
    cv2.putText(placeholder, "No image found", (WIN_W//2 - 120, WIN_H - 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2)
    return placeholder


def display_signs(text):
    """Display ISL sign images for each word or character in text."""
    text = text.upper().strip()
    if not text:
        return

    words = text.split()
    steps = []
    for word in words:
        # Check if there is an image for the full word
        word_found = False
        for ext in [".jpg", ".jpeg", ".png"]:
            if os.path.exists(os.path.join(SIGNS_DIR, word + ext)):
                word_found = True
                break
        if not word_found:
            # Check if there's a folder in dataset
            dataset_word_dir = os.path.join("dataset", word)
            if os.path.isdir(dataset_word_dir) and os.listdir(dataset_word_dir):
                word_found = True
                
        if word_found:
            steps.append(word)
        else:
            # Fallback to character spelling
            for char in word:
                if char.isalnum():
                    steps.append(char)

    if not steps:
        print("[INFO] No alphanumeric characters or words to display.")
        return

    print(f"\n[DISPLAY] Showing {len(steps)} signs for: '{text}'")
    cv2.namedWindow("ISL Sign Display", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("ISL Sign Display", WIN_W, WIN_H)

    for i, step in enumerate(steps):
        # Check if the step is a word gesture with multiple images in the dataset
        dataset_word_dir = os.path.join("dataset", step)
        if os.path.exists(dataset_word_dir) and os.path.isdir(dataset_word_dir) and len(step) > 1:
            # It's a word gesture, play animation!
            files = [f for f in os.listdir(dataset_word_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
            if files:
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
                
                # Play sequence at ~100ms per frame (slower/clearer)
                for idx, f in enumerate(selected_files):
                    path = os.path.join(dataset_word_dir, f)
                    img = cv2.imread(path)
                    if img is not None:
                        img = cv2.resize(img, (WIN_W, WIN_H))
                        
                        # Overlay info on frame
                        overlay = img.copy()
                        cv2.rectangle(overlay, (0, 0), (WIN_W, 70), (0, 0, 0), -1)
                        cv2.addWeighted(overlay, 0.5, img, 0.5, 0, img)
                        
                        cv2.putText(img, f"ISL Sign: {step}", (20, 45),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 255, 150), 3)
                        cv2.putText(img, f"{i+1} / {len(steps)} (Frame {idx+1}/{len(selected_files)})", (WIN_W - 350, 45),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)
                        
                        progress = int((i + 1) / len(steps) * WIN_W)
                        cv2.rectangle(img, (0, WIN_H - 8), (progress, WIN_H), (0, 200, 100), -1)
                        
                        cv2.imshow("ISL Sign Display", img)
                        
                        # Wait 100ms per frame to animate (increase to make it slower, e.g. 150)
                        key = cv2.waitKey(100) & 0xFF
                        if key == ord('q') or key == ord('Q'):
                            cv2.destroyAllWindows()
                            return
                # Short pause after gesture finishes
                time.sleep(0.4)
                continue

        img = load_sign_image(step)

        # Overlay info
        overlay = img.copy()
        cv2.rectangle(overlay, (0, 0), (WIN_W, 70), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.5, img, 0.5, 0, img)

        cv2.putText(img, f"ISL Sign: {step}", (20, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 255, 150), 3)
        cv2.putText(img, f"{i+1} / {len(steps)}", (WIN_W - 120, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (200, 200, 200), 2)

        progress = int((i + 1) / len(steps) * WIN_W)
        cv2.rectangle(img, (0, WIN_H - 8), (progress, WIN_H), (0, 200, 100), -1)

        cv2.imshow("ISL Sign Display", img)

        start = time.time()
        while time.time() - start < DISPLAY_TIME:
            key = cv2.waitKey(30) & 0xFF
            if key == ord('n') or key == ord('N'):
                break
            if key == ord('q') or key == ord('Q'):
                cv2.destroyAllWindows()
                return

    # End screen
    end_img = np.zeros((WIN_H, WIN_W, 3), dtype=np.uint8)
    end_img[:] = (20, 40, 20)
    cv2.putText(end_img, "Done!", (WIN_W//2 - 80, WIN_H//2),
                cv2.FONT_HERSHEY_SIMPLEX, 2.5, (0, 255, 120), 4)
    cv2.imshow("ISL Sign Display", end_img)
    cv2.waitKey(1500)
    cv2.destroyAllWindows()


def main():
    os.makedirs(SIGNS_DIR, exist_ok=True)

    print("=" * 50)
    print("  ISL Text / Speech -> Sign Language Display")
    print("=" * 50)

    while True:
        print("\nChoose input method:")
        print("  1 - Type text")
        print("  2 - Speak (microphone)")
        print("  3 - Exit")
        choice = input("Enter choice (1/2/3): ").strip()

        if choice == "1":
            text = input("Type your text: ").strip()
            if text:
                speak(f"Showing sign language for: {text}")
                display_signs(text)

        elif choice == "2":
            text = listen_from_mic()
            if text:
                speak(f"Showing sign language for: {text}")
                display_signs(text)
            else:
                print("[INFO] Nothing heard, try again.")

        elif choice == "3":
            print("[EXIT] Goodbye!")
            break

        else:
            print("[INFO] Invalid choice.")


if __name__ == "__main__":
    main()
