"""
STEP 1 - Collect ISL Dataset
=================================
Use your webcam to capture images of your hand for each sign.
Press 'S' to start capturing 300 images for the current class.
Press 'Q' to quit early.
"""

import cv2
import os

# Configuration
DATASET_DIR = "dataset"
SAMPLES_PER_CLASS = 300

# Predefined daily life words
PREDEFINED_WORDS = [
    "HELLO", "THANK_YOU", "YES", "NO", "PLEASE", 
    "HELP", "GOODBYE", "SORRY", "WELCOME", "MORE", 
    "EAT", "DRINK", "FATHER", "MOTHER", "FRIEND"
]

def select_classes():
    print("=" * 50)
    print("  ISL Dataset Collection Setup")
    print("=" * 50)
    print("Select what you want to collect:")
    print("  1 - Standard Characters & Numbers (A-Z, 1-9)")
    print("  2 - Common Daily Life Words (HELLO, THANK_YOU, etc.)")
    print("  3 - Specific Custom Word/Gesture")
    
    choice = input("\nEnter choice (1/2/3): ").strip()
    
    if choice == "1":
        return [chr(i) for i in range(ord('A'), ord('Z')+1)] + [str(i) for i in range(1, 10)]
    elif choice == "2":
        print("\nPredefined words:")
        for idx, word in enumerate(PREDEFINED_WORDS):
            print(f"  {idx + 1}. {word}")
        print("  0. Collect ALL predefined words")
        word_choice = input("\nEnter the number of the word you want to collect (or 0 for all): ").strip()
        if word_choice == "0":
            return PREDEFINED_WORDS
        try:
            val = int(word_choice)
            if 1 <= val <= len(PREDEFINED_WORDS):
                return [PREDEFINED_WORDS[val - 1]]
        except ValueError:
            pass
        print("[WARNING] Invalid choice. Collecting all predefined words.")
        return PREDEFINED_WORDS
    elif choice == "3":
        custom_word = input("\nEnter the custom word/gesture you want to train (e.g. HAPPY): ").strip().upper()
        if not custom_word:
            print("[ERROR] Word cannot be empty. Defaulting to 'HELLO'.")
            return ["HELLO"]
        return [custom_word]
    else:
        print("[WARNING] Invalid choice. Defaulting to Standard Characters & Numbers.")
        return [chr(i) for i in range(ord('A'), ord('Z')+1)] + [str(i) for i in range(1, 10)]

def main():
    if not os.path.exists(DATASET_DIR):
        os.makedirs(DATASET_DIR)

    classes_to_collect = select_classes()
    print(f"\n[INFO] Configured to collect data for: {classes_to_collect}")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam.")
        return

    print("\n" + "=" * 50)
    print("  ISL Dataset Collection")
    print("=" * 50)

    for class_name in classes_to_collect:
        class_dir = os.path.join(DATASET_DIR, class_name)
        if not os.path.exists(class_dir):
            os.makedirs(class_dir)

        print(f"\n[INFO] Getting ready to collect data for class: '{class_name}'")
        print("Press 'S' when you are ready to start capturing.")
        
        # Wait for the user to press 'S'
        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            frame = cv2.flip(frame, 1)
            cv2.putText(frame, f"Ready? Press 'S' to start class: {class_name}", (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.imshow("Dataset Collection", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('s') or key == ord('S'):
                break
            if key == ord('q') or key == ord('Q'):
                print("\n[INFO] Exiting program.")
                cap.release()
                cv2.destroyAllWindows()
                return

        print(f"[INFO] Capturing images for '{class_name}'...")
        count = 0
        while count < SAMPLES_PER_CLASS:
            ret, frame = cap.read()
            if not ret:
                continue

            frame = cv2.flip(frame, 1)
            
            # Draw ROI box (Optional, helps guide the user)
            height, width, _ = frame.shape
            cv2.rectangle(frame, (width//2 - 150, height//2 - 150), (width//2 + 150, height//2 + 150), (255, 0, 0), 2)
            
            cv2.putText(frame, f"Collecting: {class_name} [{count+1}/{SAMPLES_PER_CLASS}]", (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            cv2.imshow("Dataset Collection", frame)

            # Save the frame
            img_path = os.path.join(class_dir, f"{count}.jpg")
            cv2.imwrite(img_path, frame)
            count += 1

            if cv2.waitKey(1) & 0xFF == ord('q'):
                print("\n[INFO] Exiting program.")
                cap.release()
                cv2.destroyAllWindows()
                return

    print("\n[DONE] Dataset collection complete!")
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
