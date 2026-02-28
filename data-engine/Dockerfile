# ── Production stage ────────────────────────────────────────────────
FROM python:3.11-slim AS production

WORKDIR /app

# System deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run the Flask job runner (keeps container alive, accepts HTTP jobs)
CMD ["python", "runner.py"]

# ── Development stage ────────────────────────────────────────────────
FROM production AS development

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

CMD ["python", "runner.py"]
