#!/bin/bash

set -e

AWS_REGION="eu-central-1"



DB_INSTANCE="voxis"

CLUSTER_NAME="VoxisStaging"

SERVICES=(
  "VoxisApiService"
  "VoxisMessageWorker"
  "VoxisOutboundService"
)

echo "Starting RDS..."

aws rds start-db-instance \
    --db-instance-identifier $DB_INSTANCE \
    --region $AWS_REGION

echo "Waiting for RDS..."

aws rds wait db-instance-available \
    --db-instance-identifier $DB_INSTANCE \
    --region $AWS_REGION

echo "RDS is ready."

for SERVICE in "${SERVICES[@]}"
do
    echo "Starting $SERVICE..."

    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE \
        --desired-count 1 \
        --region $AWS_REGION
done

echo ""
echo "Voxis development environment is UP."