#!/bin/bash

set -e

CLUSTER="VoxisStaging"
REGION="eu-central-1"

SERVICES=(
    "BusinessEventService"
    "OutboxPublisherService"
    "VoxisApiTaskService"
    "VoxisFollowupScheduled"
    "VoxisMessageWorker"
    "VoxisOutboundService"
)

echo "Stopping ECS services..."

for service in "${SERVICES[@]}"; do
    echo "Stopping $service..."
    aws ecs update-service \
        --cluster "$CLUSTER" \
        --service "$service" \
        --desired-count 0 \
        --region "$REGION"
done

echo "All services stopped."
