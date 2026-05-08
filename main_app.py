"""
MAIN APP - ISL Communication Assistant
=======================================
Combined launcher for both modules.
Run this file to start the full application.

  Module 1: Sign Language -> Text + Speech  (step4_sign_to_speech.py)
  Module 2: Text / Speech -> Sign Language  (step5_text_to_sign.py)
"""

import os
import sys

BANNER = """
+------------------------------------------------------+
|     ISL Communication Assistant - Final Year Project |
|        Deaf & Mute People Communication App          |
+------------------------------------------------------+
|  Module 1: Sign Language  ->  Text + Speech          |
|  Module 2: Text / Speech  ->  Sign Language          |
+------------------------------------------------------+
"""

def check_model():
    if not os.path.exists("model/isl_model.h5"):
        print("[WARNING] Trained model not found!")
        print("  Please run the steps in order:")
        print("    python step1_collect_dataset.py   (or use Kaggle dataset)")
        print("    python step2_extract_landmarks.py")
        print("    python step3_train_model.py")
        print("    python main_app.py")
        return False
    return True


def main():
    print(BANNER)

    while True:
        print("\nSelect a module:")
        print("  1 - Module 1: Sign Language -> Text + Speech (webcam)")
        print("  2 - Module 2: Text / Speech -> Sign Language (display)")
        print("  3 - Exit")
        choice = input("\nEnter choice (1/2/3): ").strip()

        if choice == "1":
            if not check_model():
                continue
            print("\n[LAUNCHING] Sign Language -> Text + Speech ...")
            import step4_sign_to_speech
            step4_sign_to_speech.main()

        elif choice == "2":
            print("\n[LAUNCHING] Text / Speech -> Sign Language ...")
            import step5_text_to_sign
            step5_text_to_sign.main()

        elif choice == "3":
            print("\n[EXIT] Thank you! Good luck with your project!\n")
            sys.exit(0)

        else:
            print("[INFO] Please enter 1, 2, or 3.")


if __name__ == "__main__":
    main()
