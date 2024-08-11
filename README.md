# Deployment Instructions

## Prerequisites

- Docker and Docker Compose installed on your system.
- SSL Certificates (cert.pem and key.pem) for HTTPS configuration.
- `docker-compose.yml` file from the repository.

## Step 1: Prepare SSL Certificates

To enable HTTPS, you'll need an SSL certificate and a private key. You can obtain them from a Certificate Authority (CA)
or generate self-signed certificates for testing purposes.

### Generate Self-Signed SSL Certificates (Optional)

For development or testing purposes, you can generate a self-signed certificate using the following command:

```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
```

Place the generated `cert.pem` and `key.pem` files in the same directory as your `docker-compose.yml` file.

## Step 2: Set Up Environment Variables

Create a `.env` file or a `docker.env` file in the same directory as your `docker-compose.yml` file.
This file will hold the environment variables required for the services to run.

You only need the following variables:

```
POSTGRES_PASSWORD=your_database_password
DB_PASS=your_database_password
DJANGO_SECRET_KEY=your_django_secret_key
DJANGO_ALLOWED_HOSTS=['yourdomain.com', 'localhost', '127.0.0.1']
```

Replace `your_database_password`, `your_django_secret_key`, and `DJANGO_ALLOWED_HOSTS` with your own values.
If you're deploying the application locally, you can use the example values for `DJANGO_ALLOWED_HOSTS`
and if you need a Django secret key, you can generate one using the following command:

```
python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```

If you don't have Python installed, you can also go here: [Django Secret Key Generator](https://djecrety.ir/)

## Step 3: Deploy the Application

Once you've set up the environment variables and SSL certificates, you can deploy the application using Docker Compose.

Run the following command:

```
docker compose up -d
```

This command will start the application in detached mode.

## Step 4: Access the Application

- The application will be accessible at `https://localhost` by default.
- The application automatically redirects HTTP traffic to HTTPS.

## Step 5: Stop and Remove the Application

To stop the application and remove the containers, run the following command:

```
docker compose down
```

This command will stop and remove the containers, but it will retain the database volume.

If you want to remove the database volume as well, you can add the `-v` flag:

```
docker compose down -v
```

This will remove the containers and the database volume.

