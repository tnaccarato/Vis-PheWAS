
# Deployment Instructions

## Prerequisites

- Docker and Docker Compose installed on your system.
- SSL Certificates (cert.pem and key.pem) for HTTPS configuration.

## Step 1: Prepare SSL Certificates

To enable HTTPS, you'll need an SSL certificate and a private key. If you don't already have them, you can obtain them from a Certificate Authority (CA) or generate self-signed certificates for testing purposes.

### Generate Self-Signed SSL Certificates (Optional)

For development or testing purposes, you can generate a self-signed certificate using the following command:

```
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem
```

Place the generated `cert.pem` and `key.pem` files in the same directory as your `docker-compose.yml` file.

## Step 2: Set Up Environment Variables

Create a `.env` file or a `docker.env` file in the same directory as your `docker-compose.yml` file. This file will hold the environment variables required for the services to run.

Example `docker.env` file:

```
POSTGRES_DB=your_database_name
POSTGRES_USER=your_database_user
POSTGRES_PASSWORD=your_database_password
```

Replace `your_database_name`, `your_database_user`, and `your_database_password` with your actual database credentials.

## Step 3: Deploy the Application

Once you've set up the environment variables and SSL certificates, you can deploy the application using Docker Compose.

Run the following command:

```
docker-compose up -d
```

This command will start the application in detached mode.

## Step 4: Access the Application

- The application will be accessible at `https://your-domain.com` (or `https://localhost` if running locally).
- The application automatically redirects HTTP traffic to HTTPS.
