# ==============================================================
# Dockerfile — ISL Communication Assistant
# Multi-stage build: builder (install deps) → production (slim)
# ==============================================================

# ---------- Stage 1: Builder ----------
FROM python:3.10-slim AS builder

WORKDIR /app

# Install system deps needed to build OpenCV, MediaPipe, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ---------- Stage 2: Production ----------
FROM python:3.10-slim

LABEL maintainer="ISL-Team"
LABEL description="ISL Communication Assistant — Flask App"

WORKDIR /app

# Runtime system libraries (OpenCV, MediaPipe need these)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    espeak \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app.py .
COPY main_app.py .
COPY step1_collect_dataset.py .
COPY step2_extract_landmarks.py .
COPY step3_train_model.py .
COPY step4_sign_to_speech.py .
COPY step5_text_to_sign.py .
COPY requirements.txt .

# Copy directories
COPY templates/ templates/
COPY static/ static/
COPY model/ model/
COPY isl_signs/ isl_signs/
COPY dataset/ dataset/

# Expose Flask port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/')" || exit 1

# Run the Flask-SocketIO app
CMD ["python", "app.py"]
