# First stage: build the application
FROM python:3.12.3-slim as builder

WORKDIR /app

# Install Node.js and build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    libpq-dev \
    build-essential \
    gcc \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Change to the directory containing manage.py and package.json
WORKDIR /app/vis_phewas

# Install Node.js dependencies if package.json exists
COPY vis_phewas/package.json vis_phewas/package-lock.json* ./
RUN npm install

# Copy the application source code
COPY vis_phewas .

# Set STATIC_ROOT in Django settings
RUN echo "STATIC_ROOT = '/app/staticfiles'" >> vis_phewas/settings.py

# Build the application assets
RUN npm run build

# Collect static files
RUN python manage.py collectstatic --noinput

# Second stage: production image
FROM python:3.12.3-slim

WORKDIR /app

# Install PostgreSQL client tools
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy the dependencies and source code from the build stage
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /app /app

# Copy the database backup file
COPY db_backup.sql /app/db_backup.sql

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Expose the port the app runs on
EXPOSE 8000

# Run the application
CMD ["sh", "-c", "until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do echo Waiting for PostgreSQL...; sleep 2; done && if [ $(PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -tAc \"SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';\") -eq 0 ]; then PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f /app/db_backup.sql; fi && python vis_phewas/manage.py runserver 0.0.0.0:8000"]
