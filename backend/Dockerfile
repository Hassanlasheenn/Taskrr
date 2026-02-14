# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies for pyodbc and SQL Server
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    ca-certificates \
    unixodbc \
    unixodbc-dev \
    lsb-release && \
    curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg && \
    curl https://packages.microsoft.com/config/debian/12/prod.list > /tmp/mssql-release.list && \
    sed -i 's|deb |deb [signed-by=/usr/share/keyrings/microsoft-prod.gpg] |' /tmp/mssql-release.list && \
    mv /tmp/mssql-release.list /etc/apt/sources.list.d/mssql-release.list && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE $PORT

# Start command (Railway sets PORT environment variable)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
