# ==========================================================
# ISL Communication Assistant - Production Dockerfile
# ==========================================================

# ---------- Stage 1: Build dependencies ----------
FROM python:3.10-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --prefix=/install \
    -r requirements.txt


# ---------- Stage 2: Production ----------
FROM python:3.10-slim

LABEL maintainer="ISL-Team"
LABEL description="Indian Sign Language Communication Assistant"

WORKDIR /app

# Install runtime libraries required by OpenCV,
# MediaPipe, TensorFlow and text-to-speech.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    espeak \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python dependencies
COPY --from=builder /install /usr/local

# Copy application
COPY app.py .
COPY requirements.txt .

# Copy frontend files
COPY templates/ templates/
COPY static/ static/

# Copy AI model and sign-language resources
COPY model/ model/
COPY isl_signs/ isl_signs/
COPY dataset/ dataset/

# Python environment settings
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Flask application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s \
    --timeout=10s \
    --start-period=120s \
    --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/')" || exit 1

# Run Flask-SocketIO using Gunicorn
CMD ["gunicorn", "--worker-class", "gthread", "--workers", "1", "--threads", "100", "--bind", "0.0.0.0:5000", "--timeout", "120", "app:app"]
