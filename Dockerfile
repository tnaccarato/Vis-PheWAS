FROM python:3.12.3

# Set the working directory
WORKDIR /code

# Install nodejs, npm, and PostgreSQL client tools
RUN apt-get update && apt-get install -y nodejs npm postgresql-client

# Copy the requirements file and install dependencies
COPY requirements.txt /code/
RUN pip install -r requirements.txt

# Copy the rest of the application code
COPY . /code/

# Set the working directory to vis_phewas for Django management commands
WORKDIR /code/vis_phewas

# Start the application
CMD ["bash", "-c", "python manage.py migrate && PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -h $DB_HOST -f /code/db_backup.sql && python manage.py runserver 0.0.0.0:8000"]
