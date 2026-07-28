#!/bin/bash

set -e

AWS_REGION="eu-central-1"

DB_INSTANCE="voxis"

CLUSTER_NAME="VoxisStaging"

SERVICES=(
  "VoxisApiService"
  "VoxisMessageWorker"
  "VoxisOutboundService"
  "BusinessEventService"
  "OutboxPublisherService"
  "VoxisFollowupScheduled"
)

echo "Stopping ECS services..."

for SERVICE in "${SERVICES[@]}"
do
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$SERVICE" \
        --desired-count 0 \
        --region "$AWS_REGION" \
        --query "service.serviceName" \
        --output text \
        --no-cli-pager
    echo "Stopped $SERVICE."
done

echo "Waiting 30 seconds..."
sleep 30


echo "Voxis development environment is DOWN."