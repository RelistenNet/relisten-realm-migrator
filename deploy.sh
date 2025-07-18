#!/bin/bash

# Exit on error
set -e

# Define registry and image name
REGISTRY_IMAGE="relisten2.tail09dbf.ts.net:32000/relisten-realm-migrator"

echo "Starting deployment process..."

# Build the Docker image
echo "Building Docker image..."
docker build . -t ${REGISTRY_IMAGE}:latest --platform linux/amd64
docker push ${REGISTRY_IMAGE}:latest
# Clean up local Docker image after pushing to registry
echo "Cleaning up local Docker image..."
docker rmi ${REGISTRY_IMAGE}:latest

# Run the new container
echo "Restarting..."

kubectl rollout restart deployment relisten-realm-migrator

echo "Deployment completed successfully!"
